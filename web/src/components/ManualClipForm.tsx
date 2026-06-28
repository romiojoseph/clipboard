import { useState, useRef } from 'react';
import {
    Plus as PlusIcon,
    UploadSimple as ImportIcon
} from '@phosphor-icons/react';
import Button from './Button';
import styles from './ManualClipForm.module.css';

type ManualClipFormProps = {
    onAdd: (content: string) => Promise<void>;
    apiBase: string;
    onShowAlert: (title: string, message: string, type?: 'success' | 'warning' | 'error') => void;
};

export default function ManualClipForm({ onAdd, apiBase, onShowAlert }: ManualClipFormProps) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        setLoading(true);
        try {
            await onAdd(input);
            setInput('');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.currentTarget.files;
        if (!files || files.length === 0) return;

        setLoading(true);
        try {
            let count = 0;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const text = await file.text();
                const content = text.trim();
                
                if (content.length > 0) {
                    await fetch(`${apiBase}/clips`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ content }),
                    });
                    count++;
                }
            }
            onShowAlert('Import Complete', `Successfully imported ${count} clip(s) from your file(s).`);
            await onAdd('');
        } catch (err) {
            console.error('Failed to import files:', err);
            onShowAlert('Error', 'Failed to import some file(s).', 'error');
        } finally {
            setLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const triggerImport = () => {
        fileInputRef.current?.click();
    };

    return (
        <form onSubmit={handleSubmit} className={styles.form}>
            <textarea
                rows={4}
                value={input}
                placeholder="Add clip manually..."
                className={styles.input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading}
            />
            
            <div className={styles.actionRowGroup}>
                <Button type="submit" disabled={loading} className={styles.addBtn}>
                    <PlusIcon size={16} weight="bold" />
                    <span>Add</span>
                </Button>
                
                <button 
                    type="button" 
                    onClick={triggerImport} 
                    disabled={loading} 
                    className={styles.iconImportBtn}
                    title="Import Clips File"
                >
                    <ImportIcon size={20} weight="duotone" />
                </button>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md"
                multiple
                onChange={handleImport}
                disabled={loading}
                style={{ display: 'none' }}
            />
        </form>
    );
}

