import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonSemantic = 'default' | 'danger' | 'success' | 'warning';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    semantic?: ButtonSemantic;
    children: ReactNode;
}

export default function Button({
    variant = 'primary',
    size = 'md',
    semantic = 'default',
    children,
    className = '',
    ...props
}: ButtonProps) {
    const variantClass = styles[variant];
    const sizeClass = styles[size];
    const semanticClass = semantic !== 'default' ? styles[semantic] : '';

    return (
        <button
            className={`${styles.btn} ${variantClass} ${sizeClass} ${semanticClass} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
