import { useEffect, useState } from "react";
import { unsubscribeDailyMail } from "../lib/auth/api";

type Props = {
  token: string;
  onBack: () => void;
};

export function DailyMailUnsub({ token, onBack }: Props) {
  const [message, setMessage] = useState("Turning off daily quotes…");

  useEffect(() => {
    if (!token) {
      setMessage("That unsubscribe link didn’t work. Turn daily quotes off from Profile.");
      return;
    }
    let cancelled = false;
    void unsubscribeDailyMail(token).then((result) => {
      if (cancelled) return;
      setMessage(
        "ok" in result
          ? "Daily quotes are off. You can turn them back on from Profile."
          : "That unsubscribe link didn’t work. Turn daily quotes off from Profile.",
      );
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className="panel">
      <div className="section-header">
        <h2>Daily quotes</h2>
        <p>{message}</p>
      </div>
      <button type="button" className="button ghost" onClick={onBack}>
        Back to Textline
      </button>
    </section>
  );
}
