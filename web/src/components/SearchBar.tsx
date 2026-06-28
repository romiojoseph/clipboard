import styles from './SearchBar.module.css';

type SearchBarProps = {
    query: string;
    onQueryChange: (value: string) => void;
};

export default function SearchBar({ query, onQueryChange }: SearchBarProps) {
    return (
        <div className={styles.searchContainer}>
            <input
                type="search"
                value={query}
                placeholder="Search clips..."
                className={styles.input}
                onChange={(event) => onQueryChange(event.target.value)}
            />
        </div>
    );
}
