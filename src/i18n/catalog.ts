import workspace from './messages/workspace.json';
import editing from './messages/editing.json';
import history from './messages/history.json';
import library from './messages/library.json';
import sources from './messages/sources.json';
import menus from './messages/menus.json';
import nativeErrors from './messages/native-errors.json';
import vocabulary from './messages/vocabulary.json';
import notesAndVariants from './messages/notes-and-variants.json';
import smartTags from './messages/smart-tags.json';
import entitiesAndSearch from './messages/entities-and-search.json';
import inboxAndProfile from './messages/inbox-and-profile.json';
import writingAndModels from './messages/writing-and-models.json';

// Native message matching tries translated templates in their catalog order.
export const messages: Record<string, string[]> = {
  ...workspace,
  ...editing,
  ...history,
  ...library,
  ...sources,
  ...menus,
  ...nativeErrors,
  ...vocabulary,
  ...notesAndVariants,
  ...smartTags,
  ...entitiesAndSearch,
  ...inboxAndProfile,
  ...writingAndModels,
};
