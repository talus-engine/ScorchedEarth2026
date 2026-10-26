/** The game runs in instances; editor helpers have their own entry point. */
import createGame = require('game')
if (!talus.editor.available) createGame().start()
