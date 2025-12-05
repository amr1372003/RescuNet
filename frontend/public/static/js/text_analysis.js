document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    const analyzeBtn = document.getElementById('analyzeBtn');

    const initialState = document.getElementById('initialState');
    const loadingState = document.getElementById('loadingState');
    const resultState = document.getElementById('resultState');

    const classificationBox = document.getElementById('classificationBox');
    const classificationText = document.getElementById('classificationText');

    const probEmergency = document.getElementById('probEmergency');
    const barEmergency = document.getElementById('barEmergency');

    const probNonEmergency = document.getElementById('probNonEmergency');
    const barNonEmergency = document.getElementById('barNonEmergency');

    const probFake = document.getElementById('probFake');
    const barFake = document.getElementById('barFake');

    const entitiesContainer = document.getElementById('entitiesContainer');

    // File Upload Handling
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = `Selected: ${file.name}`;
            fileNameDisplay.classList.remove('hidden');

            const reader = new FileReader();
            reader.onload = (e) => {
                textInput.value = e.target.result;
            };
            reader.readAsText(file);
        }
    });

    // Analyze Button Logic
    analyzeBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
            alert("Please enter text or upload a file first.");
            return;
        }

        // UI State: Loading
        initialState.classList.add('hidden');
        resultState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

        // Simulate Network Delay (Mock Backend)
        setTimeout(() => {
            const result = mockAnalysis(text);
            renderResults(result);

            // UI State: Result
            loadingState.classList.add('hidden');
            resultState.classList.remove('hidden');
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="fas fa-search"></i> Analyze Text';
        }, 1500);
    });

    function mockAnalysis(text) {
        // Simple heuristic for demo purposes
        const lowerText = text.toLowerCase();
        let type = 'not_emergency';

        if (lowerText.includes('help') || lowerText.includes('fire') || lowerText.includes('injured') || lowerText.includes('blood') || lowerText.includes('trapped')) {
            type = 'emergency';
        } else if (lowerText.includes('scam') || lowerText.includes('winner') || lowerText.includes('buy') || lowerText.includes('click here')) {
            type = 'fake';
        } else {
            // Randomize slightly if ambiguous
            const rand = Math.random();
            if (rand > 0.8) type = 'fake';
            else if (rand > 0.6) type = 'emergency';
        }

        // Generate probabilities based on type
        let pEmerg, pNon, pFake;

        if (type === 'emergency') {
            pEmerg = 0.85 + (Math.random() * 0.14);
            pNon = (1 - pEmerg) * 0.7;
            pFake = (1 - pEmerg) * 0.3;
        } else if (type === 'fake') {
            pFake = 0.85 + (Math.random() * 0.14);
            pNon = (1 - pFake) * 0.6;
            pEmerg = (1 - pFake) * 0.4;
        } else {
            pNon = 0.80 + (Math.random() * 0.15);
            pEmerg = (1 - pNon) * 0.5;
            pFake = (1 - pNon) * 0.5;
        }

        return {
            classification: type,
            probabilities: {
                emergency: pEmerg,
                not_emergency: pNon,
                fake: pFake
            },
            entities: extractMockEntities(text)
        };
    }

    function extractMockEntities(text) {
        const words = text.split(/\s+/);
        const entities = [];
        // Mock entity extraction (grabbing capitalized words or numbers)
        words.forEach(word => {
            if (word.length > 3 && /^[A-Z]/.test(word)) {
                if (!entities.includes(word.replace(/[^a-zA-Z]/g, ''))) entities.push(word.replace(/[^a-zA-Z]/g, ''));
            }
        });
        return entities.slice(0, 5); // Limit to 5
    }

    function renderResults(data) {
        // Reset Classes
        classificationBox.className = 'text-center p-6 rounded-xl border-2 transition-all';

        // Set Classification
        if (data.classification === 'emergency') {
            classificationText.textContent = 'EMERGENCY';
            classificationBox.classList.add('bg-red-900/20', 'border-red-500', 'text-red-400');
        } else if (data.classification === 'fake') {
            classificationText.textContent = 'FAKE / SPAM';
            classificationBox.classList.add('bg-slate-700/30', 'border-slate-500', 'text-slate-400');
        } else {
            classificationText.textContent = 'NOT EMERGENCY';
            classificationBox.classList.add('bg-blue-900/20', 'border-blue-500', 'text-blue-400');
        }

        // Update Bars
        const pE = Math.round(data.probabilities.emergency * 100);
        const pN = Math.round(data.probabilities.not_emergency * 100);
        const pF = Math.round(data.probabilities.fake * 100);

        probEmergency.textContent = `${pE}%`;
        barEmergency.style.width = `${pE}%`;

        probNonEmergency.textContent = `${pN}%`;
        barNonEmergency.style.width = `${pN}%`;

        probFake.textContent = `${pF}%`;
        barFake.style.width = `${pF}%`;

        // Update Entities
        entitiesContainer.innerHTML = '';
        if (data.entities.length > 0) {
            data.entities.forEach(ent => {
                const tag = document.createElement('span');
                tag.className = 'px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded border border-slate-700';
                tag.textContent = ent;
                entitiesContainer.appendChild(tag);
            });
        } else {
            entitiesContainer.innerHTML = '<span class="text-slate-500 text-xs italic">No entities detected</span>';
        }
    }
});
