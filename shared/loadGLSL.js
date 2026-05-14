/**
 * Fetches and returns the source text of a GLSL shader file.
 * @param {string|URL} path
 * @returns {Promise<string>}
 */
export async function loadGLSL(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load shader: ${path}`);
    return res.text();
}
