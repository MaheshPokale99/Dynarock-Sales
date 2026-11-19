import { MS_PER_DAY } from "../constants.js";

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * MS_PER_DAY);
