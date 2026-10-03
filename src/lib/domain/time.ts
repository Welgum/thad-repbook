export function dateInZone(time: number, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(time);
	const part = (type: string) => parts.find((p) => p.type === type)!.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validZone(zone: string): boolean {
	try {
		dateInZone(Date.now(), zone);
		return true;
	} catch {
		return false;
	}
}
export function validDate(date: string): boolean {
	return (
		/^\d{4}-\d{2}-\d{2}$/.test(date) &&
		!Number.isNaN(Date.parse(date)) &&
		new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
	);
}
export function shiftDate(date: string, days: number): string {
	const d = new Date(`${date}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}
export function calendarDays(month: string): string[] {
	const first = `${month}-01`;
	const day = new Date(`${first}T12:00:00Z`).getUTCDay();
	const start = shiftDate(first, -((day + 6) % 7));
	return Array.from({ length: 42 }, (_, i) => shiftDate(start, i));
}
export function weekOf(date: string): string {
	return shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export function displayDate(date: string): string {
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${date}T12:00:00Z`));
}
export function clock(seconds: number): string {
	const n = Math.max(0, Math.ceil(seconds));
	return `${Math.floor(n / 60)
		.toString()
		.padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
}
export function durationLabel(seconds: number | null): string {
	return seconds === null ? 'Not recorded' : `${Math.round(seconds / 60)} min`;
}
