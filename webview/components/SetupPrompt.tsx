import React, { useEffect } from "react";

export type SetupChoice = "keep" | "review";

interface SetupPromptProps {
  visible: boolean;
  onChoice: (choice: SetupChoice) => void;
  onDismiss: () => void;
}

export function SetupPrompt({
  visible,
  onChoice,
  onDismiss,
}: SetupPromptProps) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="setup-prompt-overlay" onClick={onDismiss}>
      <div
        className="setup-prompt-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-prompt-title"
      >
        <div className="setup-prompt-header">
          <h2 id="setup-prompt-title">Welcome to Markdown Studio</h2>
          <button
            className="setup-prompt-close"
            onClick={onDismiss}
            aria-label="Dismiss setup prompt"
          >
            ×
          </button>
        </div>
        <div className="setup-prompt-body">
          <p>
            Markdown Studio reformats files on open. Compacts lists, unifies
            bullet markers, and similar tidy-ups. Then, it gets out of your way.
          </p>
          <p>
            Pick how you'd like to handle the reformatting. You can change any
            of these at any time from the ⚙ settings panel.
          </p>
        </div>
        <div className="setup-prompt-actions">
          <button
            className="setup-prompt-button setup-prompt-button-secondary"
            onClick={() => onChoice("review")}
          >
            Review settings
          </button>
          <button
            className="setup-prompt-button setup-prompt-button-primary"
            onClick={() => onChoice("keep")}
          >
            Keep defaults
          </button>
        </div>
      </div>
    </div>
  );
}
