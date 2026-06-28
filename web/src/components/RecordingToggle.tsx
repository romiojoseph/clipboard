import { Circle, RadioButton } from '@phosphor-icons/react';
import styles from './RecordingToggle.module.css';

type RecordingToggleProps = {
    recording: boolean;
    onToggle: (value: boolean) => void;
};

export default function RecordingToggle({
    recording,
    onToggle,
}: RecordingToggleProps) {
    const label = recording ? 'On' : 'Off';
    const Icon = recording ? RadioButton : Circle;
    const weight = recording ? 'fill' : 'duotone';

    return (
        <button
            onClick={() => onToggle(!recording)}
            className={`${styles.toggle} ${recording ? styles.on : styles.off}`}
            aria-label={`Recording is ${label}`}
            aria-pressed={recording}
            type="button"
        >
            <Icon size={24} weight={weight} />
            <span className={styles.label}>{label}</span>
        </button>
    );
}