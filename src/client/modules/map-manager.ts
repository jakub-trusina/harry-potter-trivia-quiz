import { GameStateManager } from './state-manager.js';
import { Territory } from '../../types/game.js';
import { addLogEntry } from './log-manager.js';

export function createMap(state: GameStateManager): void {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    
    // Clear existing map
    mapContainer.innerHTML = '';
    
    // Create grid
    Object.values(state.territories).forEach(territory => {
        const territoryElement = createTerritoryElement(state, territory);
        mapContainer.appendChild(territoryElement);
    });
}

export function updateMap(state: GameStateManager): void {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    
    // Update each territory's classes
    Object.values(state.territories).forEach(territory => {
        const territoryElement = mapContainer.querySelector(`[data-id="${territory.id}"]`);
        if (territoryElement) {
            // Remove existing classes
            territoryElement.className = 'territory player-territory';
            // Re-add classes based on current state
            addTerritoryClasses(territoryElement as HTMLElement, territory, state);
        }
    });
}

function createTerritoryElement(state: GameStateManager, territory: Territory): HTMLElement {
    const territoryDiv = document.createElement('div');
    territoryDiv.className = 'territory player-territory';
    territoryDiv.dataset.id = territory.id;
    
    // Add territory value
    const valueElement = document.createElement('div');
    valueElement.className = 'territory-value';
    valueElement.textContent = territory.value.toString();
    territoryDiv.appendChild(valueElement);
    
    // Set position
    territoryDiv.style.gridColumn = (territory.x + 1).toString();
    territoryDiv.style.gridRow = (territory.y + 1).toString();
    
    // Add special classes
    addTerritoryClasses(territoryDiv, territory, state);
    
    // Add click handler
    territoryDiv.addEventListener('click', () => handleTerritoryClick(territory.id, state));
    
    return territoryDiv;
}

function addTerritoryClasses(element: HTMLElement, territory: Territory, state: GameStateManager): void {
    // Add capitol class
    if (territory.isCapitol) {
        element.classList.add('capitol');
        element.dataset.shields = territory.shields?.toString() || '0';
    }
    
    // Add supply line status
    if (territory.owner === state.playerId && !territory.hasSupplyLine) {
        element.classList.add('disconnected');
        element.title = 'This territory is disconnected from your capitol. You cannot attack from here.';
    }
    
    // Add ownership styling
    if (territory.owner) {
        const owner = state.players.find(p => p.id === territory.owner);
        if (owner?.house) {
            element.classList.add(`house-${owner.house.toLowerCase()}`);
        }
        if (territory.owner === state.playerId) {
            element.classList.add('my-territory');
        }
    }
    
    // Add attackable class
    if (state.currentTurn === state.playerId && canAttackTerritory(territory.id, state)) {
        element.classList.add('attackable');
    }
}

export function canAttackTerritory(territoryId: string, state: GameStateManager): boolean {
    const territory = state.territories[territoryId];
    if (!territory || !state.playerId) return false;

    // Can't attack if it's not your turn or your own territory
    if (state.gameActive && territory.owner === state.playerId) return false;

    // Check if the territory is adjacent to any of the player's territories with supply lines
    const [tx, ty] = territory.id.split('-').map(Number);
    
    return Object.values(state.territories).some(t => {
        if (t.owner !== state.playerId || !t.hasSupplyLine) return false;
        const [x, y] = t.id.split('-').map(Number);
        const dx = Math.abs(x - tx);
        const dy = Math.abs(y - ty);
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
    });
}

function handleTerritoryClick(territoryId: string, state: GameStateManager): void {
    if (!state.gameActive || !state.playerId) return;
    
    const territory = state.territories[territoryId];
    if (!territory) return;

    // Handle clicking own territory
    if (territory.owner === state.playerId) {
        handleOwnTerritoryClick(territory, state);
        return;
    }

    // Handle attack
    if (canAttackTerritory(territoryId, state)) {
        handleAttack(territoryId, state);
    } else {
        addLogEntry('Cannot attack this territory - it must be adjacent to one of your connected territories!');
    }
}

function handleOwnTerritoryClick(territory: Territory, state: GameStateManager): void {
    if (territory.isCapitol) {
        const shields = territory.shields || 0;
        addLogEntry(`This is your capitol! It has ${shields} shield${shields !== 1 ? 's' : ''}.`);
        return;
    }

    // For regular territories, show distance from capitol
    const capitolTerritory = Object.values(state.territories)
        .find(t => t.owner === state.playerId && t.isCapitol);
    
    if (capitolTerritory) {
        const [tx, ty] = territory.id.split('-').map(Number);
        const [cx, cy] = capitolTerritory.id.split('-').map(Number);
        const distance = Math.abs(tx - cx) + Math.abs(ty - cy); // Manhattan distance
        addLogEntry(`This is your territory at [${tx}, ${ty}]. Distance from capitol: ${distance}.`);
    }
}

function handleAttack(territoryId: string, state: GameStateManager): void {
    if (!state.socket) {
        console.error('No socket connection available');
        return;
    }

    const territory = state.territories[territoryId];
    const defender = state.players.find(p => p.id === territory.owner);
    
    addLogEntry(`Attacking ${defender?.name || 'unclaimed territory'} at [${territory.x}, ${territory.y}]`);
    state.socket.emit('attack-territory', territoryId);
}

export function initializeMapDebugger(state: GameStateManager): void {
    document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('territory') || target.closest('.territory')) {
            const territoryElement = target.classList.contains('territory') ? 
                                    target : target.closest('.territory') as HTMLElement;
            const territoryId = territoryElement.dataset.id;
            
            if (territoryId && state.territories[territoryId]) {
                const territory = state.territories[territoryId];
                const ownerInfo = territory.owner ? 
                                `Owned by: ${state.players.find(p => p.id === territory.owner)?.name || 'Unknown player'}` : 
                                'Unowned';
                
                console.log(`Territory ${territoryId}:`, {
                    x: territory.x,
                    y: territory.y,
                    value: territory.value,
                    owner: territory.owner,
                    ownerInfo,
                    isAttackable: canAttackTerritory(territoryId, state)
                });
                
                const hasAttackClass = territoryElement.classList.contains('attackable');
                if (hasAttackClass !== canAttackTerritory(territoryId, state)) {
                    console.warn('Mismatch between attackable class and canAttackTerritory function!');
                }
            }
        }
    });
} 