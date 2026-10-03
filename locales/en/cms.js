const cms = { common: { page: 'Page', pages: 'Pages', title: 'Title', slug: 'URL', intro: 'Introduction', content: 'Content', category: 'Category', draft: 'Draft', published: 'Published', preview: 'Preview', attachment: 'Attachment', image: 'Image', file: 'File', documents: 'Documents' }, notFound: { metadata: 'Page not found | Turufjell Vel', title: 'Page not found', description: 'The page may have been moved, unpublished or deleted.', home: 'Back to the home page' }, richEditor: { mainText: 'Main text', formatting: 'Formatting', paragraph: 'Paragraph', heading2: 'Heading 2', heading3: 'Heading 3', bold: 'Bold', italic: 'Italic', bulletList: 'Bulleted list', orderedList: 'Numbered list', quote: 'Quote', undo: 'Undo', redo: 'Redo', linkAddress: 'Link address', invalidLink: 'Use a valid HTTPS, HTTP, mailto or internal link.', selectText: 'Select the text that should become a link first.', linkAdded: 'The link was added.', addLink: 'Add link', removeLink: 'Remove link', help: 'Simple formatting without custom fonts, colours or HTML. Maximum 100,000 text characters.' } };
cms.preview = { title: 'Preview', published: 'Published', draft: 'Draft', back: 'Back to CMS' };
cms.common.richTextError = 'The article text could not be displayed.';
cms.categories = { 'Nyttig info': 'Useful information', Administrativt: 'Administration', Årsmøter: 'Annual meetings', Nyheter: 'News' };
cms.admin = { saveStates: { saved: 'All changes saved', dirty: 'Waiting to save automatically …', saving: 'Saving automatically …', error: 'Automatic save failed' }, loadError: 'Could not load the page.', saveError: 'Could not save the page.', savedPublished: 'The page was saved and published.', draftCreated: 'The draft was created.', validTitle: 'Enter a valid title and URL before adding files.', draftUploadError: 'Could not create the draft before uploading files.', statusError: 'Could not change the status.', publishedNotice: 'The page was published.', unpublishedNotice: 'The page was unpublished and saved as a draft.', imageUploadError: 'Could not upload the image.', imageUploaded: '{draft}The image was uploaded. Remember to add alt text and save the page.', draftPrefix: 'The draft was created. ', draftButPrefix: 'The draft was created, but ', attachmentUploadError: 'Could not upload {name}.', attachmentsUploaded: '{draft}{count} attachments uploaded.', partialUpload: '{count} attachments were uploaded, but the rest failed. ', renameError: 'Could not change the name.', nameSaved: 'The display name was saved.', orderError: 'Could not change the order.', deletePageError: 'Could not delete the page.', pageDeleted: 'The page was deleted.', removeImageError: 'Could not remove the image.', imageRemoved: 'The image was removed.', removeAttachmentError: 'Could not remove the attachment.', attachmentRemoved: 'The attachment was removed.', deletePageTitle: 'Delete “{title}”?', removeImageTitle: 'Remove the main image?', removeAttachmentTitle: 'Remove “{title}”?', attachmentFallback: 'the attachment', searchLabel: 'Search by title', searchPlaceholder: 'Search for a page …', search: 'Search', reset: 'Reset', newPage: 'New page', storageWarning: 'Text content can be created, but image and file uploads require Neon Object Storage to be configured.', loading: 'Loading page …', pages: 'Web pages', tableCaption: 'All active web pages. Use the actions to edit, preview or change publication status.', title: 'Title', category: 'Category', status: 'Status', modified: 'Last modified', published: 'Published', actions: 'Actions', draft: 'Draft', edit: 'Edit', preview: 'Preview', unpublish: 'Unpublish', publish: 'Publish', delete: 'Delete', noneFound: 'No pages found', noneHelp: 'Create the first information page or try another search.', editPage: 'Edit web page', website: 'Web page', createPage: 'Create page', close: 'Close', deletePageDescription: 'The page is hidden immediately, but its content and files are retained in the database.', removeDescription: 'The item is removed from the page, but retained as deleted in the system.', deletePage: 'Delete page', remove: 'Remove', pageContent: 'Page content', characters: '{count}/{max} characters', slugHelp: 'Suggested from the title. Use lower-case letters, numbers and hyphens.', intro: 'Introduction', introHelp: '{count}/500 characters. A short introduction is recommended.', optional: 'Optional', mainImage: 'Main image', changeImage: 'Change image', removeImage: 'Remove image', uploadImage: 'Upload main image', imageFormats: 'JPG, PNG or WebP · max 10 MB', uploadPrerequisite: 'Enter a title and URL. The first upload automatically creates a draft.', altText: 'Alt text', altHelp: 'Briefly describe the image for people who cannot see it. Recommended when the image conveys information.', imageCaption: 'Image caption', attachments: 'Attachments', addFiles: 'Add files', displayName: 'Display name', saveName: 'Save name', moveUp: 'Move {title} up', up: 'Up', moveDown: 'Move {title} down', down: 'Down', noAttachments: 'No attachments have been added.', created: 'Created', saving: 'Saving …', saveDraft: 'Save draft', file: 'File' };
cms.admin.categories = cms.categories;
export default cms;
Object.assign(cms.admin, { copy: 'Copy to new article', copied: 'The article was copied to an unpublished draft with separate files. Check its title and URL before publishing.' });

Object.assign(cms.admin, {
  "loadingEditor": "Loading text editor …",
  "historyError": "Could not load revision history.",
  "fixErrors": "Fix the errors before publishing.",
  "justifyWarnings": "Explain why the warnings can be overridden (at least 10 characters).",
  "publishing": "Publishing …",
  "savedAt": "Saved at {time}.",
  "statusChanged": "Status updated.",
  "saveBeforeUpload": "Save the page before uploading files.",
  "uploadStates": {
    "uploading": "Uploading",
    "done": "Complete",
    "failed": "Failed"
  },
  "reused": "The file has been reused on this page.",
  "removeFileConfirm": "Remove “{title}”? The file is retained in revision history.",
  "restoreConfirm": "Restore revision {revision}? The current content is retained in history.",
  "revisionRestored": "Revision {revision} has been restored as a new revision.",
  "untitled": "Untitled",
  "unsaved": "Unsaved changes",
  "backToList": "Back to list",
  "conflictTitle": "A newer version exists",
  "conflictHelp": "Another tab or editor saved this page. Choose which version to continue editing.",
  "loadServerVersion": "Load server version",
  "copyDraft": "Copy my draft",
  "working": "Working …",
  "content": "Content",
  "mediaTitle": "Image and documents",
  "chooseMedia": "Choose from media library",
  "decorative": "The image is decorative",
  "retry": "Try again",
  "visibility": "Link and visibility",
  "slug": "URL",
  "quality": "Publication and quality",
  "error": "Error",
  "warning": "Warning",
  "overrideReason": "Reason for overriding warnings",
  "stillPublished": "The public page still displays the most recently published revision.",
  "revision": "Revision {revision}",
  "history": "Revision history",
  "restore": "Restore",
  "mediaLibrary": "Media library",
  "mediaHelp": "Files are private and copied to this page when reused. Removing a file from a page retains it in revision history.",
  "type": "Type",
  "all": "All",
  "images": "Images",
  "documents": "Documents",
  "since": "From date",
  "filter": "Filter",
  "revisionUses": "{count} revisions",
  "use": "Use",
  "archivedNotice": "The page has been archived and can be restored.",
  "restoredNotice": "The page has been restored.",
  "active": "Active",
  "drafts": "Drafts",
  "publishedPages": "Published",
  "archivedPages": "Archived",
  "sort": "Sort order",
  "oldestModified": "Oldest update",
  "titleAsc": "Title A–Z",
  "titleDesc": "Title Z–A",
  "unpublishedChanges": "unpublished changes",
  "archived": "Archived",
  "archive": "Archive",
  "restorePageConfirm": "Restore “{title}”?",
  "archivePageConfirm": "Archive “{title}”?",
  "restorePageHelp": "The page is restored as a draft.",
  "archivePageHelp": "The page is hidden from the public, but its content, files and history are retained.",
  "openError": "Could not open the editor",
  "reloadHelp": "Try reloading the page. No changes have been made.",
  "findings": {
    "missingTitle": "A title is required.",
    "longTitle": "The title is long ({count} characters).",
    "missingIntro": "An introduction is missing.",
    "missingImageAlt": "Add alt text or mark the image as decorative.",
    "weakImageAlt": "The alt text must describe the image more precisely.",
    "missingDocumentTitle": "A document needs a display name.",
    "invalidRichText": "The main text contains unsupported content.",
    "headingJump": "A heading level has been skipped.",
    "emptyLink": "A link is missing its address.",
    "genericLink": "Use descriptive link text instead of “click here/read more”.",
    "emptyBody": "The main text is missing."
  }
});
Object.assign(cms.preview, {
  "width": "Preview width",
  "mobile": "Mobile",
  "tablet": "Tablet",
  "desktop": "Desktop",
  "revision": "Revision {revision}"
});
cms.richEditor.characters = "{count}/100,000 characters.";
