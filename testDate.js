const getDateWithoutTime = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

console.log('getDateWithoutTime(new Date()):', getDateWithoutTime(new Date()).toISOString());
console.log('new Date(2026, 2, 5, 0, 0, 0, 0):', new Date(2026, 2, 5, 0, 0, 0, 0).toISOString());
console.log('new Date("2026-03-05"):', new Date("2026-03-05").toISOString());
