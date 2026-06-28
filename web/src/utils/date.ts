/**
 * Formats a date string or Date object into the format:
 * "01 Jan, 2026 • 09:41 PM"
 */
export function formatDate(dateInput: string | Date): string {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const hourStr = String(hours).padStart(2, '0');

    return `${day} ${month}, ${year} • ${hourStr}:${minutes} ${ampm}`;
}
