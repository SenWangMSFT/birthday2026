export function validMemory(memory) {
  if (!memory || typeof memory.caption !== "string" || typeof memory.alt !== "string") return false;
  if (memory.photos !== undefined) {
    return memory.image === undefined && Array.isArray(memory.photos) &&
      memory.photos.length > 0 && memory.photos.length <= 6 &&
      memory.photos.every((photo) => photo && typeof photo.src === "string" && photo.src.trim() &&
        typeof photo.alt === "string" && photo.alt.trim());
  }
  return memory.image === null || typeof memory.image === "string" && Boolean(memory.image.trim());
}

export function memoryPhotos(memory) {
  if (!validMemory(memory)) throw new TypeError("A memory needs a caption, alt text and either an image or one to six valid photos.");
  return memory.photos ?? (memory.image === null ? [] : [{ src: memory.image, alt: memory.alt }]);
}
