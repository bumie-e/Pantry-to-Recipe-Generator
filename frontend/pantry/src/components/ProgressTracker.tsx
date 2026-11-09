import React from 'react';

interface Props {
  steps: string[];
  /** Index of the step currently running. */
  stage: number;
  label: string;
  /** 0-100 */
  percent: number;
  name: string;
}

const ProgressTracker: React.FC<Props> = ({ steps, stage, label, percent, name }) => (
  <div className="progress" role="status" aria-live="polite">
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s} className={i <= stage ? 'on' : ''}>{s}</li>
      ))}
    </ol>
    <div
      className="bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={name}
    >
      <div className="bar-fill" style={{ width: `${Math.max(percent, 4)}%` }} />
    </div>
    <p className="progress-label">{label} ({percent}%)</p>
  </div>
);

export default ProgressTracker;
