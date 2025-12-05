import math
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import GINEConv

from typing import Union
from networkx import MultiDiGraph, MultiGraph

def extract_pyg_data(G: Union[MultiDiGraph, MultiGraph]) -> tuple[Data, list[tuple[str, str, int]]]:
    """Converts NetworkX graph to PyG Data object matching training format."""
    node_list = list(G.nodes())
    node_map = {n: i for i, n in enumerate(node_list)}

    # Type Map: road=0, survivor=1, pickup/assembly=2
    type_map = {'road': 0, 'survivor': 1, 'pickup': 2, 'assembly': 2}
    
    node_feats = []
    for n in node_list:
        d = G.nodes[n]
        t = type_map.get(d.get('type', 'road'), 0)
        u = float(d.get('urgency', 0.0))
        c = float(d.get('survivor_count', 0.0))
        node_feats.append([t, u, c])
    
    x = torch.tensor(node_feats, dtype=torch.float)

    edge_indices = []
    edge_attrs = []
    
    ordered_edges = [] 
    
    for u, v, k, d in G.edges(keys=True, data=True):
        if u not in node_map or v not in node_map: continue
        
        u_idx = node_map[u]
        v_idx = node_map[v]
        edge_indices.append([u_idx, v_idx])
        ordered_edges.append((u, v, k))
        
        dist = float(d.get('length', 1.0))
        log_dist = math.log1p(dist)
        
        # State map: clear=0, partial=1, blocked=2
        state_str = d.get('state', 'clear')
        state_val = 0.0
        if state_str == 'partial': state_val = 1.0
        elif state_str == 'blocked': state_val = 2.0
            
        edge_attrs.append([log_dist, state_val])

    edge_index = torch.tensor(edge_indices, dtype=torch.long).t().contiguous()
    edge_attr = torch.tensor(edge_attrs, dtype=torch.float)
    
    return Data(x=x, edge_index=edge_index, edge_attr=edge_attr), ordered_edges


class RescuNet(nn.Module):
    def __init__(self, hidden_dim: int = 64) -> None:
        super().__init__()

        self.emb = nn.Embedding(3, hidden_dim)

        self.proj = nn.Linear(2, hidden_dim)

        self.node_encoder = nn.Sequential(
            nn.Linear(2 * hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
        )

        self.edge_encoder = nn.Sequential(
            nn.Linear(2, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )

        self.conv1 = GINEConv(
            nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim),
            ),
            edge_dim=hidden_dim
        )
        
        self.conv2 = GINEConv(
            nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim),
            ),
            edge_dim=hidden_dim
        )
        
        self.conv3 = GINEConv(
            nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.ReLU(),
                nn.Linear(hidden_dim, hidden_dim),
            ),
            edge_dim=hidden_dim
        )

        self.decoder = nn.Sequential(
            nn.Linear(3 * hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

    def forward(self, x, edge_index, edge_attr, batch=None):
        if batch is None:
            batch = torch.zeros(x.size(0), dtype=torch.long, device=x.device)
        node_types = x[:, 0].long()
        node_nums = x[:, 1:]

        emb = self.emb(node_types)
        proj = self.proj(node_nums)

        x = torch.cat([emb, proj], dim=1)
        x = self.node_encoder(x)

        edge_emb = self.edge_encoder(edge_attr)
        x = F.relu(self.conv1(x, edge_index, edge_attr=edge_emb)) + x
        x = F.relu(self.conv2(x, edge_index, edge_attr=edge_emb)) + x
        x = F.relu(self.conv3(x, edge_index, edge_attr=edge_emb)) + x

        row, col = edge_index
        edge_feat_final = torch.cat([x[row], x[col], edge_emb], dim=-1)

        logits = self.decoder(edge_feat_final).squeeze(-1)
        return logits

    def load_model(self, model_path, device):
        state_dict = torch.load(model_path, map_location=device, weights_only=True)
        self.load_state_dict(state_dict)
        self.to(device)
        self.eval()