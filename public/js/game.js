// Wait for the DOM to be fully loaded before initializing
document.addEventListener('DOMContentLoaded', () => {
    // Connect to Socket.io server
    const socket = io();
    
    // Game state variables
    let playerId = null;
    let playerName = '';
    let gameActive = false;
    let territoryData = {};
    let playerData = [];
    
    // DOM elements
    const loginScreen = document.getElementById('login-screen');
    const lobbyScreen = document.getElementById('lobby-screen');
    const mapContainer = document.getElementById('map-container');
    const playerList = document.getElementById('player-list');
    const playerStats = document.getElementById('player-stats');
    
    const playerNameInput = document.getElementById('player-name');
    const joinGameBtn = document.getElementById('join-game-btn');
    const startGameBtn = document.getElementById('start-game-btn');
    const newGameBtn = document.getElementById('new-game-btn');
    
    // Event listeners
    joinGameBtn.addEventListener('click', joinGame);
    startGameBtn.addEventListener('click', startGame);
    newGameBtn.addEventListener('click', () => {
        window.location.reload();
    });

    // Socket event handlers
    socket.on('connect', () => {
        playerId = socket.id || null;
        console.log('Connected to server with ID:', playerId);
    });

    socket.on('player-list-update', (players) => {
        playerData = players;
        updatePlayerList();
        updateStartButton();
        
        if (gameActive) {
            updatePlayerStats();
        }
    });

    // Game functions
    function getHouseFromName(name) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('gryffindor')) return 'gryffindor';
        if (lowerName.includes('slytherin')) return 'slytherin';
        if (lowerName.includes('ravenclaw')) return 'ravenclaw';
        if (lowerName.includes('hufflepuff')) return 'hufflepuff';
        return null;
    }

    function updatePlayerList() {
        if (!playerList) return;
        playerList.innerHTML = '';
        playerData.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name;
            if (player.id === playerId) {
                li.classList.add('current-player');
            }
            playerList.appendChild(li);
        });
    }

    function updateStartButton() {
        if (!startGameBtn) return;
        const canStart = playerData.length >= 2 && playerData.length <= 4;
        startGameBtn.disabled = !canStart;
    }

    function updatePlayerStats() {
        if (!playerStats) return;
        playerStats.innerHTML = '';
        playerData.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-stat';
            const house = getHouseFromName(player.name);
            if (house) {
                div.classList.add(`house-${house}`);
            }
            div.innerHTML = `
                <span class="player-name">${player.name}</span>
                <span class="player-score">Score: ${player.score}</span>
                <span class="territory-count">Territories: ${player.territories.length}</span>
            `;
            playerStats.appendChild(div);
        });
    }

    function joinGame() {
        if (!playerNameInput.value.trim()) {
            alert('Please enter your wizard name');
            return;
        }
        
        playerName = playerNameInput.value.trim();
        socket.emit('join-game', playerName);
        
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        
        // Move modals to body
        const quizModal = document.getElementById('quiz-modal');
        const gameOverModal = document.getElementById('game-over-modal');

        if (quizModal) {
            quizModal.classList.add('hidden');
            if (quizModal.parentElement !== document.body) {
                document.body.appendChild(quizModal);
            }
        }

        if (gameOverModal) {
            gameOverModal.classList.add('hidden');
            if (gameOverModal.parentElement !== document.body) {
                document.body.appendChild(gameOverModal);
            }
        }
    }

    function startGame() {
        console.log("📣 Emitting start-game event to server");
        socket.emit('start-game');
    }

    function createMap(territories) {
        console.log("Creating map with territories:", territories);
        territoryData = territories;
        mapContainer.innerHTML = '';
        
        Object.values(territories).forEach(territory => {
            const territoryDiv = document.createElement('div');
            territoryDiv.className = 'territory player-territory';
            territoryDiv.dataset.id = territory.id;
            
            const valueElement = document.createElement('div');
            valueElement.className = 'territory-value';
            valueElement.textContent = territory.value.toString();
            territoryDiv.appendChild(valueElement);
            
            territoryDiv.style.gridColumn = (territory.x + 1).toString();
            territoryDiv.style.gridRow = (territory.y + 1).toString();
            
            const owner = playerData.find(p => p.id === territory.owner);
            if (owner) {
                const house = getHouseFromName(owner.name);
                if (house) {
                    territoryDiv.classList.add(`house-${house}`);
                }
                if (owner.id === playerId) {
                    territoryDiv.classList.add('my-territory');
                }
            } else {
                territoryDiv.style.backgroundColor = 'rgba(50, 50, 50, 0.7)';
            }
            
            mapContainer.appendChild(territoryDiv);
        });
    }

    function canAttackTerritory(territoryId) {
        const territory = territoryData[territoryId];
        if (!territory || !playerId) return false;

        // Can't attack own territory
        if (territory.owner === playerId) return false;

        // Check if the territory is adjacent to any of the player's territories
        const [tx, ty] = territory.id.split('-').map(Number);
        
        return Object.values(territoryData).some(t => {
            if (t.owner !== playerId) return false;
            const [x, y] = t.id.split('-').map(Number);
            const dx = Math.abs(x - tx);
            const dy = Math.abs(y - ty);
            return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
        });
    }

    // Add game-start event handler
    socket.on('game-start', (data) => {
        gameActive = true;
        territoryData = data.territories;
        playerData = data.players;
        createMap(data.territories);
        updatePlayerStats();
        
        lobbyScreen.classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
    });

    // Add the event listener for territory debugging
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('territory') || target.closest('.territory')) {
            const territoryElement = target.classList.contains('territory') ? 
                                    target : target.closest('.territory');
            const territoryId = territoryElement.dataset.id;
            
            if (territoryId && territoryData[territoryId]) {
                const territory = territoryData[territoryId];
                const ownerInfo = territory.owner ? 
                                `Owned by: ${playerData.find(p => p.id === territory.owner)?.name || 'Unknown player'}` : 
                                'Unowned';
                
                console.log(`Territory ${territoryId}:`, {
                    x: territory.x,
                    y: territory.y,
                    value: territory.value,
                    owner: territory.owner,
                    ownerInfo,
                    isAttackable: canAttackTerritory(territoryId)
                });
                
                const hasAttackClass = territoryElement.classList.contains('attackable');
                if (hasAttackClass !== canAttackTerritory(territoryId)) {
                    console.warn('Mismatch between attackable class and canAttackTerritory function!');
                }
            }
        }
    });
}); 