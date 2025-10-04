// src/utils/userCreatedPools.ts

const getStorageKey = (publicKey: string) => `saros_dlmm_user_pools_${publicKey}`;

/**
 * Adds a new pool address to the user's list in localStorage.
 * @param poolAddress The address of the newly created pool.
 * @param publicKey The user's wallet public key string.
 */
export const addUserCreatedPool = (poolAddress: string, publicKey: string) => {
    if (!publicKey) return;
    try {
        const key = getStorageKey(publicKey);
        const existingPoolsJson = localStorage.getItem(key);
        const existingPools: string[] = existingPoolsJson ? JSON.parse(existingPoolsJson) : [];

        // Add the new pool only if it's not already in the list
        if (!existingPools.includes(poolAddress)) {
            const updatedPools = [poolAddress, ...existingPools];
            localStorage.setItem(key, JSON.stringify(updatedPools));
        }
    } catch (error) {
        console.error("Failed to update user created pools list:", error);
    }
};

/**
 * Retrieves the list of pool addresses created by the user.
 * @param publicKey The user's wallet public key string.
 * @returns An array of pool address strings.
 */
export const getUserCreatedPools = (publicKey: string): string[] => {
    if (!publicKey) return [];
    try {
        const key = getStorageKey(publicKey);
        const poolsJson = localStorage.getItem(key);
        return poolsJson ? JSON.parse(poolsJson) : [];
    } catch (error) {
        console.error("Failed to retrieve user created pools list:", error);
        return [];
    }
};