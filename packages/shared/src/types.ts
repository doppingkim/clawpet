export type TaskCategory = 'coding' | 'shopping' | 'calendar' | 'writing' | 'research' | 'other';
export type TaskStatus = 'started' | 'thinking' | 'working' | 'done' | 'error';

export type TaskEvent = {
  id: string;
  ts: number;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  summary?: string;
};

export type PetState = {
  hunger: number;
  affection: number;
  energy: number;
  mood: 'happy' | 'idle' | 'sleepy' | 'hungry' | 'lonely';
};
