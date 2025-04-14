export interface UIElements {
    // Help system
    helpButtons: HTMLButtonElement[];
    helpModal: HTMLDivElement;
    closeHelpButton: HTMLButtonElement;
    
    // Login and lobby screens
    loginScreen: HTMLDivElement;
    lobbyScreen: HTMLDivElement;
    playerNameInput: HTMLInputElement;
    joinGameBtn: HTMLButtonElement;
    startGameBtn: HTMLButtonElement;
    playerList: HTMLUListElement;
    
    // Game screen elements
    gameScreen: HTMLDivElement;
    mapContainer: HTMLDivElement;
    playerStats: HTMLDivElement;
    logEntries: HTMLDivElement;
    
    // Modals
    quizModal: HTMLDivElement;
    gameOverModal: HTMLDivElement;
    
    // Quiz elements
    questionContainer: HTMLDivElement;
    answersContainer: HTMLDivElement;
    duelStatus: HTMLDivElement;
    duelResult: HTMLDivElement;
    timer: HTMLDivElement;
} 