export type ConversationActionStatusAccent = 'sky' | 'rose' | 'amber' | 'emerald';

export interface ConversationActionStatus {
  accent: ConversationActionStatusAccent;
  label: string;
  description: string;
}
