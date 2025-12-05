import torch
import torch.nn as nn
import torch.nn.functional as F

class TextClassifier(nn.Module):
    """
    Bidirectional LSTM Classifier with Global Max Pooling and Temperature Scaling.
    Architecture matches the training script for state_dict compatibility.
    """
    def __init__(self, vocab_size: int, embedding_dim: int, hidden_dim: int, 
                 num_layers: int, dropout_rate: float, pad_idx: int):
        super().__init__()
        
        self.embedding = nn.Embedding(vocab_size, embedding_dim, padding_idx=pad_idx)
        self.dropout = nn.Dropout(dropout_rate)
        
        self.lstm = nn.LSTM(
            input_size=embedding_dim, 
            hidden_size=hidden_dim, 
            num_layers=num_layers,
            bidirectional=True, 
            batch_first=True, 
            dropout=dropout_rate if num_layers > 1 else 0
        )
        
        self.fc = nn.Linear(hidden_dim * 2, 2)
        
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def forward(self, input_ids: torch.Tensor, use_temperature: bool = False) -> torch.Tensor:
        embedded = self.embedding(input_ids)
        embedded = self.dropout(embedded)
        
        lstm_out, _ = self.lstm(embedded)
        
        lstm_out = lstm_out.permute(0, 2, 1)
        pooled = F.max_pool1d(lstm_out, lstm_out.size(2)).squeeze(2)
        
        pooled = self.dropout(pooled)
        logits = self.fc(pooled)
        
        if use_temperature:
            logits = logits / self.temperature
            
        return logits

def load_text_classifier(model_path: str, device: str = None):
    """
    Loads the model and vocabulary from the checkpoint.
    
    Args:
        model_path (str): Path to the .pt file.
        device (str): Device to load ('cpu' or 'cuda'). Auto-detects if None.

    Returns:
        tuple: (model, vocab) -> Returns both so inference can tokenize correctly.
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
    # 1. Read the .pt file content (it's a dictionary)
    conf = torch.load(model_path, map_location=device, weights_only=True)
    
    # 2. Initialize architecture using the saved config
    model = TextClassifier(
        vocab_size=conf['config']['vocab_size'], 
        embedding_dim=conf['config']['embedding_dim'], 
        hidden_dim=conf['config']['hidden_dim'], 
        num_layers=conf['config']['num_layers'], 
        dropout_rate=conf['config']['dropout_rate'], 
        pad_idx=conf['config']['pad_idx']
    )
    
    # 3. Load the weights
    model.load_state_dict(conf['model_state_dict'])
    model.to(device)
    model.eval()
    
    # 4. Return model AND vocab (accessed via conf['vocab'])
    return model, conf['vocab']