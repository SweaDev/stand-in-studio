/** User commands, triggered by global hotkeys or UI buttons (Command pattern). */
export type CommandName = 'hideMe' | 'pin' | 'raiseHand' | 'backSoon' | 'cycleMode';

export const COMMAND_NAMES: readonly CommandName[] = ['hideMe', 'pin', 'raiseHand', 'backSoon', 'cycleMode'];

/** The receiver commands act on (implemented by StudioEngine). */
export interface CommandReceiver {
  toggleHide(): void;
  togglePin(): void;
  toggleRaiseHand(): void;
  toggleBackSoon(): void;
  cycleMode(): void;
}

export interface Command {
  readonly name: CommandName;
  readonly label: string;
  execute(r: CommandReceiver): void;
}

export const COMMANDS: Readonly<Record<CommandName, Command>> = Object.freeze({
  hideMe: { name: 'hideMe', label: 'Hide me', execute: (r) => r.toggleHide() },
  pin: { name: 'pin', label: 'Pin opacity', execute: (r) => r.togglePin() },
  raiseHand: { name: 'raiseHand', label: 'Raise hand', execute: (r) => r.toggleRaiseHand() },
  backSoon: { name: 'backSoon', label: 'Back soon', execute: (r) => r.toggleBackSoon() },
  cycleMode: { name: 'cycleMode', label: 'Cycle mode', execute: (r) => r.cycleMode() },
});

export function isCommandName(v: unknown): v is CommandName {
  return typeof v === 'string' && (COMMAND_NAMES as readonly string[]).includes(v);
}
