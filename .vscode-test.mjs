import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	version: '1.133.0',
	files: 'out/test/**/*.test.js',
});
