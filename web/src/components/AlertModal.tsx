import Button from './Button';
import styles from './AlertModal.module.css';

type AlertModalProps = {
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'error';
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
};

export default function AlertModal({
    isOpen,
    title,
    message,
    type,
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
}: AlertModalProps) {
    const iconText = type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✕';
    const iconClass =
        type === 'success'
            ? styles.iconSuccess
            : type === 'warning'
            ? styles.iconWarning
            : styles.iconError;

    return (
        <div className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`}>
            <div className={styles.container}>
                <div className={styles.header}>
                    <div className={`${styles.icon} ${iconClass}`}>{iconText}</div>
                    <h3 className={styles.title}>{title}</h3>
                </div>
                <p className={styles.message}>{message}</p>
                <div className={styles.actions}>
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel}>
                            {cancelLabel}
                        </Button>
                    )}
                    <Button
                        semantic={type === 'error' ? 'danger' : type}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
