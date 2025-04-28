# Hogwarts Territory Conquest

A multiplayer territory conquest game with Harry Potter theme. Players answer quiz questions to capture territories and duel against other players.

## Features
- Real-time multiplayer gameplay with Socket.io
- Territory-based conquest system
- Wizard duels between players
- Harry Potter themed quiz questions
- Dynamic game map with visual territory control
- Turn-based gameplay
- Multi-round capitol battles
- Player stats tracking
- Action log for game events

## How to Play
1. Enter your wizard name and join the game
2. Wait for at least one other player to join (2-4 players supported)
3. Start the game when everyone is ready
4. On your turn, click on an adjacent territory to attack it
5. Answer Harry Potter questions correctly to capture territories
6. Defend your territories in wizard duels
7. Capture all opponent capitols to win!

## Game Mechanics
- Each player starts with a capitol territory and several regular territories
- Territories are connected by supply lines - you can only attack from territories connected to your capitol
- Territories have values (1-3) that determine their strength and point value
- Capitol territories have shields that must be depleted through multiple successful attacks
- Players earn points for correctly answering questions and controlling territories
- Win by either capturing all opponent capitols or having the highest score when time expires

## Technologies Used
- TypeScript
- Node.js
- Express
- Socket.io
- HTML/CSS/JavaScript

## Recent Improvements
- Fixed UI layout issues for better game experience
- Enhanced player stats display showing all players simultaneously
- Improved turn indicator positioning and visibility
- Fixed duel response time tracking for accurate results
- Better error handling and state management during gameplay
- Enhanced debugging and logging for easier troubleshooting
- Responsive design for different screen sizes

## Setup Guide

### Prerequisites
- Node.js (version 14 or higher recommended)
- npm (usually comes with Node.js)
- Web browser (Chrome, Firefox, or Edge recommended)

### Installation
1. Clone the repository
   ```
   git clone https://github.com/jakub-trusina/harry-potter-trivia-quiz.git
   cd harry-potter-trivia-quiz
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Build the project
   ```
   npm run build
   ```

4. Start the server
   ```
   npm start
   ```

5. Access the game
   - Open your browser and navigate to `http://localhost:3000`
   - For multiple players, you can:
     - Open multiple browser tabs
     - Access from different devices on the same network using your computer's IP address
       (e.g., `http://192.168.1.100:3000` - find your IP with `ipconfig` on Windows or `ifconfig` on Mac/Linux)

### Game Configuration
- Questions are loaded from the `src/data/questions.json` file
- You can modify this file to add your own Harry Potter questions
- The format for questions should be:
  ```json
  {
    "id": "q1",
    "question": "Who is the Headmaster of Hogwarts?",
    "answers": [
      "Albus Dumbledore",
      "Severus Snape",
      "Minerva McGonagall",
      "Rubeus Hagrid"
    ],
    "correctAnswer": 0,
    "difficulty": "easy"
  }
  ```

### Troubleshooting
- If you see a "port in use" error, change the port in `src/server/server.ts` (look for `const PORT = 3000`)
- For network connection issues, check your firewall settings
- Make sure all players are on the same network when playing across multiple devices
- Check browser console for any error messages

## Development
- Run in development mode with automatic restart on file changes:
  ```
  npm run dev
  ```

- The main files are:
  - `src/server/server.ts`: Server-side game logic
  - `src/client/game.ts`: Client-side game initialization
  - `src/client/modules/*.ts`: Client-side game modules
  - `src/public/css/style.css`: Game styling
  - `src/public/index.html`: Game interface

### Finding Your Local IP Address

#### On Windows:
1. Open Command Prompt (search for "cmd" in the Start menu)
2. Type `ipconfig` and press Enter
3. Look for the "IPv4 Address" under your active network connection
4. The IP address will look like `192.168.x.x` or `10.0.x.x`

#### On macOS:
1. Click the Apple menu and select "System Settings"
2. Click on "Network"
3. Select your active connection (Wi-Fi or Ethernet) from the left panel
4. Your IP address will be displayed on the right side

#### On Linux:
1. Open a terminal
2. Type `ip addr show` or `ifconfig` and press Enter
3. Look for your active connection (often "eth0" for Ethernet or "wlan0" for Wi-Fi)
4. Find the "inet" or "inet addr" line, which shows your IP address

After finding your IP address, other players on your network can connect to your game using:
```
http://YOUR_IP_ADDRESS:3000
```

For example, if your IP address is 192.168.1.5, they would use:
```
http://192.168.1.5:3000
``` 