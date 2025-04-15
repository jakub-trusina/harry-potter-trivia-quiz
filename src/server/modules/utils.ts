/**
 * Utility functions for the game
 */

/**
 * Shuffles an array using the Fisher-Yates algorithm
 * @param array The array to shuffle
 * @returns The shuffled array
 */
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Gets the distance between two points using Manhattan distance
 * @param x1 X coordinate of first point
 * @param y1 Y coordinate of first point
 * @param x2 X coordinate of second point
 * @param y2 Y coordinate of second point
 * @returns The Manhattan distance between the points
 */
export function getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Gets adjacent territories for a given position
 * @param x X coordinate
 * @param y Y coordinate
 * @param grid Grid size
 * @returns Array of adjacent territory IDs
 */
export function getAdjacentTerritories(x: number, y: number, grid: number): string[] {
    const adjacent: string[] = [];
    if (x > 0) adjacent.push(`${x-1}-${y}`);
    if (x < grid-1) adjacent.push(`${x+1}-${y}`);
    if (y > 0) adjacent.push(`${x}-${y-1}`);
    if (y < grid-1) adjacent.push(`${x}-${y+1}`);
    return adjacent;
} 