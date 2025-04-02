import { House } from '../types/game';

export function getHouseFromName(name: string): House | null {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('gryffindor')) return 'gryffindor';
    if (lowerName.includes('slytherin')) return 'slytherin';
    if (lowerName.includes('ravenclaw')) return 'ravenclaw';
    if (lowerName.includes('hufflepuff')) return 'hufflepuff';
    return null;
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