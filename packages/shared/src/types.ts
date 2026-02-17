export type TaskCategory =
  | 'coding' | 'shopping' | 'calendar' | 'writing' | 'research'
  | 'music' | 'communication' | 'gaming' | 'art' | 'cooking'
  | 'finance' | 'learning' | 'other';

export type TaskStatus = 'started' | 'thinking' | 'working' | 'done' | 'error';

export type TaskEvent = {
  id: string;
  ts: number;
  category: TaskCategory;
  status: TaskStatus;
  summary?: string;
};

export type PetState = {
  hunger: number;
  affection: number;
  energy: number;
  mood: 'happy' | 'neutral' | 'sad';
};
