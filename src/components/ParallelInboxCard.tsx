import type { ParallelInboxItem } from "../lib/inbox/api";

type Props = {
  item: ParallelInboxItem;
};

export function ParallelInboxCard({ item }: Props) {
  return (
    <article className="inbox-line-card parallel-inbox-card">
      <p className="inbox-line-from">
        {item.from.displayName} sent a parallel · {item.context}
      </p>
      <p className="parallel-conn-text">{item.text}</p>
      <a className="button ghost" href={`#/parallel/${item.packId}`}>
        Open {item.packName}
      </a>
    </article>
  );
}
