// The Learn screen as the shell mounts it. Loaded on first use.
import { LearnApp } from './LearnApp';

export default function LearnScreen({ onExit }: { onExit: () => void }) {
  return <LearnApp onExit={onExit} />;
}
