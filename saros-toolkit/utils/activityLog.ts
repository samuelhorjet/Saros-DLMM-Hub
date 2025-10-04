// src/utils/activityLog.ts

export interface Activity {
    type: 'Create Pool' | 'Add Liquidity' | 'Remove Liquidity' | 'Burn Position';
    details: string;
    tx: string;
    timestamp: number;
}

const LOG_KEY = 'saros_dlmm_activity_log';
const MAX_LOG_SIZE = 7; // Keep the last 7 activities

/**
 * Adds a new activity to the log in localStorage.
 * @param newActivity The activity object to add.
 */
export const addActivityLog = (newActivity: Omit<Activity, 'timestamp'>) => {
    try {
        const fullActivity: Activity = { ...newActivity, timestamp: Date.now() };

        const existingLogJson = localStorage.getItem(LOG_KEY);
        const existingLog: Activity[] = existingLogJson ? JSON.parse(existingLogJson) : [];

        // Add the new activity to the beginning of the array
        const updatedLog = [fullActivity, ...existingLog];

        // Trim the log to the maximum size
        const trimmedLog = updatedLog.slice(0, MAX_LOG_SIZE);

        localStorage.setItem(LOG_KEY, JSON.stringify(trimmedLog));
    } catch (error) {
        console.error("Failed to update activity log:", error);
    }
};

/**
 * Retrieves the activity log from localStorage.
 * @returns An array of activity objects.
 */
export const getActivityLog = (): Activity[] => {
    try {
        const logJson = localStorage.getItem(LOG_KEY);
        return logJson ? JSON.parse(logJson) : [];
    } catch (error) {
        console.error("Failed to retrieve activity log:", error);
        return [];
    }
};