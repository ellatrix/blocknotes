import { Filesystem, Encoding } from '@capacitor/filesystem';
import { useEffect, useRef, useCallback } from 'react';
import {
	createBlock,
	parse,
	getBlockContent,
	serialize,
} from '@wordpress/blocks';
import { decodeEntities } from '@wordpress/html-entities';

export function createRevisionName() {
	return new Date().toISOString().replaceAll(':', '_');
}

function encode(char) {
	return '%' + char.charCodeAt(0).toString(16).toUpperCase();
}

function sanitizeFileName(name) {
	// Replace invalid characters with their percent-encoded equivalents
	return (
		name
			.replace(/[\\/:*?"<>|]/g, encode)
			// Control characters.
			.replace(/[\u0000-\u001F\u007F\u0080-\u009F]+/g, ' ')
	);
}

function useDebouncedCallback(callback, delay) {
	const callbackRef = useRef(callback);
	const timeoutRef = useRef(null);
	const lastArgsRef = useRef();

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	const debouncedCallback = useCallback(
		(...args) => {
			lastArgsRef.current = args;
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			timeoutRef.current = setTimeout(() => {
				callbackRef.current(...lastArgsRef.current);
			}, delay);
		},
		[delay]
	);

	useEffect(
		() => () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
				callbackRef.current(...lastArgsRef.current);
			}
		},
		[]
	);

	return debouncedCallback;
}

const tagRegex = /<u>(#[\p{L}\p{N}]+)<\/u>/gu;

export function getTagsFromText(text) {
	const matches = text.match(tagRegex);
	if (!matches) {
		return [];
	}
	return [...new Set(matches.map((match) => match.replace(/<\/?u>/g, '')))];
}

export function stripTags(text) {
	return text.replace(tagRegex, '');
}

export function getTitleFromBlocks(blocks, second) {
	function flattenBlocks(_blocks) {
		return _blocks.reduce((acc, block) => {
			if (block.innerBlocks?.length) {
				acc.push(...flattenBlocks(block.innerBlocks));
				return acc;
			}
			acc.push(block);
			return acc;
		}, []);
	}

	blocks = flattenBlocks(blocks);

	for (const block of blocks) {
		const html = getBlockContent(block);
		const textContent = stripTags(html)
			.replace(/<[^>]+>/g, '')
			.trim()
			.slice(0, 50)
			.trim();
		if (textContent) {
			if (second) {
				second = false;
				continue;
			}
			return decodeEntities(textContent);
		}
	}

	return '';
}

export async function saveFile({
	selectedFolderURL,
	itemRef,
	setItem,
	currentRevisionRef,
	trash = false,
}) {
	let { id, path, blocks, text: oldText } = itemRef.current;
	const text = serialize(blocks);

	if (text !== oldText) {
		if (!path) {
			path = `${Date.now()}.html`;
		}

		// First write to the actual file, if revisioning fails, we can recover.
		// This main file is always our source of truth.

		// First write because it's more important than renaming.
		await Filesystem.writeFile({
			path,
			directory: selectedFolderURL,
			data: text,
			encoding: Encoding.UTF8,
		});

		// Create path + '.revisions/' if it doesn't exist.
		try {
			await Filesystem.mkdir({
				path: path + '.revisions',
				directory: selectedFolderURL,
			});
		} catch (e) {}

		await Filesystem.writeFile({
			path: path + '.revisions/' + currentRevisionRef.current + '.html',
			directory: selectedFolderURL,
			data: text,
			encoding: Encoding.UTF8,
		});

		const tags = getTagsFromText(text);

		setItem(id, {
			path,
			text,
			tags,
			mtime: Date.now(),
		});

		const title = sanitizeFileName(
			getTitleFromBlocks(blocks).replace(/#/g, encode) +
				(tags.length ? ' ' + tags.join(' ') : '')
		);

		let newPath;
		if (title) {
			const base = path.split('/').slice(0, -1).join('/');
			newPath = base ? base + '/' + title + '.html' : title + '.html';
		}

		if (newPath && newPath !== path) {
			// Check if the wanted file name already exists.
			try {
				const exists = await Filesystem.stat({
					path: newPath,
					directory: selectedFolderURL,
				});

				// If it does, add a timestamp to the file name.
				if (exists) {
					newPath = newPath.replace('.html', `.${Date.now()}.html`);
				}
			} catch (e) {}

			await Filesystem.rename({
				from: path,
				to: newPath,
				directory: selectedFolderURL,
			});
			setItem(id, { path: newPath });

			try {
				await Filesystem.rename({
					from: path + '.revisions',
					to: newPath + '.revisions',
					directory: selectedFolderURL,
				});
			} catch (e) {
				// Revert the file name change.
				await Filesystem.rename({
					from: newPath,
					to: path,
					directory: selectedFolderURL,
				});
				setItem(id, { path });
			}
		}
	}

	if (trash) {
		await Filesystem.deleteFile({
			path,
			directory: selectedFolderURL,
		});
	}
}

export function Write({
	selectedFolderURL,
	item,
	setItem,
	currentRevisionRef,
}) {
	const isMounted = useRef(false);
	const debouncedUpdateFile = useDebouncedCallback(saveFile, 1000);
	const { path, blocks } = item;
	const itemRef = useRef(item);

	useEffect(() => {
		currentRevisionRef.current = createRevisionName();
	}, [currentRevisionRef]);

	useEffect(() => {
		itemRef.current = item;
	}, [item]);

	useEffect(() => {
		const args = {
			selectedFolderURL,
			itemRef,
			setItem,
			currentRevisionRef,
		};
		if (isMounted.current) {
			debouncedUpdateFile(args);
		} else {
			isMounted.current = true;
		}
	}, [
		currentRevisionRef,
		debouncedUpdateFile,
		selectedFolderURL,
		path,
		blocks,
		setItem,
	]);

	return null;
}

export function Read({ item, setItem, selectedFolderURL }) {
	const { path, id } = item;
	useEffect(() => {
		if (path) {
			Filesystem.readFile({
				path,
				directory: selectedFolderURL,
				encoding: Encoding.UTF8,
			}).then((file) => {
				setItem(id, {
					text: file.data,
					tags: getTagsFromText(file.data),
					blocks: parse(file.data),
				});
			});
		} else {
			// Initialise with empty paragraph because we don't want merely clicking
			// on an empty note to save it.
			setItem(id, { blocks: [createBlock('core/paragraph')] });
		}
	}, [path, id, selectedFolderURL, setItem]);
	return null;
}
