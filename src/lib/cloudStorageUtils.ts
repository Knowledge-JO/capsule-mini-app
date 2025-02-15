import {
  CloudStorageKey,
  CloudStorageValue,
  telegramCloudStorage,
} from "./telegramCloudStorage";

const INITIAL_CHUNK_COUNT = 32;
const MAX_RETRIES = 256;

export type ErrorHandler = (errorMessage: string) => void;

const storeWithChunking = async (
  key: CloudStorageKey,
  value: CloudStorageValue
): Promise<number> => {
  const store = (k: CloudStorageKey, v: CloudStorageValue): Promise<void> => {
    return new Promise((resolve, reject) => {
      telegramCloudStorage.setItem(k, v, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  };

  const storeChunks = async (
    baseKey: CloudStorageKey,
    chunks: string[],
    depth: number = 0
  ): Promise<number> => {
    if (depth > MAX_RETRIES) {
      throw new Error(
        `Failed to store after ${MAX_RETRIES} splitting attempts`
      );
    }

    const failedChunks: { index: number; value: string }[] = [];

    await Promise.all(
      chunks.map(async (chunk, index) => {
        const chunkKey = `${baseKey}_chunk_${index}`;
        try {
          await store(chunkKey, chunk);
        } catch (error) {
          failedChunks.push({ index, value: chunk });
          console.log("Error storing chunk", error);
        }
      })
    );

    if (failedChunks.length === 0) {
      return chunks.length;
    }

    const newChunks: string[] = chunks.filter(
      (_, index) => !failedChunks.some((fc) => fc.index === index)
    );

    for (const { value } of failedChunks) {
      const midPoint = Math.ceil(value.length / 2);
      newChunks.push(value.slice(0, midPoint), value.slice(midPoint));
    }

    return storeChunks(baseKey, newChunks, depth + 1);
  };

  try {
    console.log(`Storing "${key}"...`, "info");
    const initialChunkSize = Math.ceil(value.length / INITIAL_CHUNK_COUNT);
    const initialChunks = Array.from({ length: INITIAL_CHUNK_COUNT }, (_, i) =>
      value.slice(i * initialChunkSize, (i + 1) * initialChunkSize)
    ).filter((chunk) => chunk.length > 0);

    const totalChunks = await storeChunks(key, initialChunks);
    await store(`${key}_meta`, JSON.stringify({ totalChunks }));
    console.log(
      `Successfully stored "${key}" in ${totalChunks} chunks`,
      "success"
    );
    return totalChunks;
  } catch (error) {
    console.log(
      `Failed to store "${key}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};

const retrieveChunkedData = async (
  key: CloudStorageKey
): Promise<CloudStorageValue> => {
  const retrieve = (
    k: CloudStorageKey
  ): Promise<CloudStorageValue | undefined> => {
    return new Promise((resolve, reject) => {
      telegramCloudStorage.getItem(k, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  };

  try {
    const metaData = await retrieve(`${key}_meta`);
    if (!metaData) {
      throw new Error(`No metadata found for key ${key}`);
    }
    const { totalChunks } = JSON.parse(metaData) as { totalChunks: number };
    console.log(`Retrieving data for "${key}" (${totalChunks} chunks)`, "info");

    const chunks = await Promise.all(
      Array.from({ length: totalChunks }, (_, i) =>
        retrieve(`${key}_chunk_${i}`)
      )
    );

    const data = chunks.join("");
    console.log(
      `Successfully retrieved and recombined data for "${key}"`,
      "success"
    );

    return data;
  } catch (error) {
    console.log(
      `Failed to retrieve data for "${key}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};

const clearChunkedStorage = async (): Promise<void> => {
  try {
    console.log("Starting storage clearance...", "info");
    const keys = await new Promise<CloudStorageKey[]>((resolve, reject) => {
      telegramCloudStorage.getKeys((error, result) => {
        if (error) reject(error);
        else resolve(result || []);
      });
    });

    const keyGroups: Record<string, string[]> = {};
    keys.forEach((key) => {
      const baseKey = key.endsWith("_meta") ? key.replace("_meta", "") : key;
      if (!keyGroups[baseKey]) keyGroups[baseKey] = [];
      keyGroups[baseKey].push(key);
    });

    await Promise.all(
      Object.entries(keyGroups).map(async ([baseKey, groupKeys]) => {
        if (groupKeys.includes(`${baseKey}_meta`)) {
          const metaData = await new Promise<string | undefined>(
            (resolve, reject) => {
              telegramCloudStorage.getItem(
                `${baseKey}_meta`,
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
            }
          );

          if (metaData) {
            const { totalChunks } = JSON.parse(metaData);
            groupKeys.push(
              ...Array.from(
                { length: totalChunks },
                (_, i) => `${baseKey}_chunk_${i}`
              )
            );
          }
        }

        await new Promise<void>((resolve, reject) => {
          telegramCloudStorage.removeItems(groupKeys, (error) => {
            if (error) reject(error);
            else resolve();
          });
        });
      })
    );

    console.log("Storage cleared successfully", "success");
  } catch (error) {
    console.log(
      `Error clearing storage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }
};

export { storeWithChunking, retrieveChunkedData, clearChunkedStorage };
