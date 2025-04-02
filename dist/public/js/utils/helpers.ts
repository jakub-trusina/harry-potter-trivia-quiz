import { House } from '../types/game';

// Keep track of assigned houses
const assignedHouses = new Map<string, House>();
const usedHouses = new Set<House>();

export function getHouseFromName(name: string): House | null {
    const lowerName = name.toLowerCase();
    console.log('Getting house for name:', name);
    
    // If this name already has an assigned house, return it
    if (assignedHouses.has(lowerName)) {
        const house = assignedHouses.get(lowerName)!;
        console.log(`Returning previously assigned house for ${name}: ${house}`);
        return house;
    }
    
    // Check if name contains house identifier
    const isGryffindor = lowerName.includes('gryffindor');
    const isSlytherin = lowerName.includes('slytherin');
    const isRavenclaw = lowerName.includes('ravenclaw');
    const isHufflepuff = lowerName.includes('hufflepuff');
    
    // Log the checks
    console.log('House checks:', {
        name: name,
        lowerName: lowerName,
        isGryffindor,
        isSlytherin,
        isRavenclaw,
        isHufflepuff
    });
    
    let assignedHouse: House | null = null;
    
    // First try to assign based on name
    if (isGryffindor && !usedHouses.has('gryffindor')) assignedHouse = 'gryffindor';
    else if (isSlytherin && !usedHouses.has('slytherin')) assignedHouse = 'slytherin';
    else if (isRavenclaw && !usedHouses.has('ravenclaw')) assignedHouse = 'ravenclaw';
    else if (isHufflepuff && !usedHouses.has('hufflepuff')) assignedHouse = 'hufflepuff';
    
    // If no house assigned yet, find the first available house
    if (!assignedHouse) {
        const availableHouses: House[] = ['gryffindor', 'slytherin', 'ravenclaw', 'hufflepuff'].filter(
            house => !usedHouses.has(house as House)
        ) as House[];
        
        if (availableHouses.length > 0) {
            // Use letter code or name hash to choose from available houses
            const firstLetter = lowerName.charAt(0);
            const letterCode = firstLetter.charCodeAt(0) - 'a'.charCodeAt(0);
            
            if (letterCode >= 0 && letterCode < 26) {
                assignedHouse = availableHouses[letterCode % availableHouses.length];
            } else {
                const nameHash = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
                assignedHouse = availableHouses[nameHash % availableHouses.length];
            }
        } else {
            console.warn('No more houses available! Using fallback assignment...');
            assignedHouse = 'gryffindor';
        }
    }
    
    // Store the assignment
    if (assignedHouse) {
        assignedHouses.set(lowerName, assignedHouse);
        usedHouses.add(assignedHouse);
        console.log(`Assigned house for ${name}: ${assignedHouse}`);
    }
    
    return assignedHouse;
}

// Add a function to reset house assignments (useful for new games)
export function resetHouseAssignments(): void {
    assignedHouses.clear();
    usedHouses.clear();
    console.log('House assignments have been reset');
}

export function formatResponseTime(ms: number): string {
    return (ms / 1000).toFixed(2) + 's';
}

export function moveModalsToBody(): void {
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

export function debugDuel(message: string): void {
    console.log(`DUEL DEBUG: ${message}`);
    // Also add to the game log so it's visible
    const logEntries = document.getElementById('log-entries');
    if (logEntries) {
        const entry = document.createElement('div');
        entry.classList.add('log-entry');
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> DEBUG: ${message}`;
        logEntries.appendChild(entry);
        setTimeout(() => {
            logEntries.scrollTop = logEntries.scrollHeight;
        }, 10);
    }
} 