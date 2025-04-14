export function addLogEntry(message: string): void {
    const logEntries = document.getElementById('log-entries');
    if (logEntries) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="log-timestamp">${new Date().toLocaleTimeString()}</span>
            <span>${message}</span>
        `;
        logEntries.appendChild(entry);
        // Scroll to bottom
        logEntries.scrollTop = logEntries.scrollHeight;
    }
} 