// ww-private-family-file
// The private family edition's marker. Nothing in the public game imports this file, so its token
// must never appear in the public bundle (test/privateedition.test.js proves it, and deploy.yml
// fails the Pages build if it does). Every other file in src/family/ starts with the file token on
// its first line.
export const FAMILY_SENTINEL = 'ww-private-family-3c91';
export const FAMILY_FILE_TOKEN = 'ww-private-family-file';
