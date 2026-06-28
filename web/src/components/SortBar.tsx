import styles from './SortBar.module.css';

type SortBarProps = {
    sortBy: string;
    onSortChange: (sortBy: string) => void;
};

export default function SortBar({ sortBy, onSortChange }: SortBarProps) {
    return (
        <div className={styles.container}>
            <label className={styles.label}>Sort by:</label>
            <select value={sortBy} className={styles.select} onChange={(e) => onSortChange(e.target.value)}>
                <option value="recent">Recent</option>
                <option value="oldest">Oldest</option>
                <option value="pinned">Pinned First</option>
                <option value="alphabetical">Alphabetical</option>
            </select>
        </div>
    );
}
