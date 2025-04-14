import { GameState } from '../../types/game';
import { UIElements } from '../../types/ui';

export function initializeUI(state: GameState): UIElements | null;
export function initializeUIElements(): UIElements | null;
export function setupHelpModal(ui: UIElements): void; 