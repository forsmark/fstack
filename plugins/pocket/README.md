# pocket

A pocket for questions that Claude has for you while you are away. Claude puts
a question in the pocket and continues with other work. You see that questions
wait, open the pocket when you are ready, and answer. The answer reaches
Claude as your own message, with the question attached.

Each pocketed question holds what you need to answer it cold: the question in
one sentence, the context, the options with what each leads to and the
recommended one marked, what Claude does in the meantime, how urgent it is,
when Claude asked, and what it relates to.

What you see:

- A row above the prompt, only while the pocket holds something:
  `pocket: 3 open, 1 blocks work, oldest 4h`. Its `open` button opens the
  pocket in a pane.
- `/pocket` lists every question in full, with a button for each option and a
  field for your own answer. In the terminal it also opens the pane, and the
  row in the transcript is then one line. There the list is shown to you only. It goes in no request, so it costs no tokens.
- On the phone and on the web, through Remote Control, `/pocket` prints the
  list as plain text, with the command that answers each question. They show
  no row above the prompt, no pane and no buttons. Claude reads that text
  too, so a list from there costs the tokens of the questions it shows.
- A question that blocks work also raises one notification when Claude
  pockets it. There is no other reminder.

How you answer:

- Press an option, or type your own answer in the field.
- Or type `/pocket 1 a` for option a of Q1, or `/pocket 1 keep them until
  Monday` for your own answer. `/pocket 1` shows Q1 alone.
- `/pocket` runs while a turn is in flight. An answer never interrupts the
  turn: Claude gets it when the turn ends. Several answers go out together as
  one message.

What Claude gets is one line for each answer, as a user message:

```
Pocket answer Q1 "How many days do we keep a deleted record?": a, 100 days
```

Beside it Claude gets a note from the plugin with the record of each answered
question, so it does not need to recall the question.

What Claude calls:

- `mcp__pocket__ask` pockets a question and returns its id. Its description
  holds the rules: pocket a decision that is yours and can wait, decide the
  rest itself, and do not repeat a pocketed question in later messages. One
  rule tells Claude to end each status message with `Pocket: <n> open` while
  questions wait, because the phone and the web show no other sign.
- `mcp__pocket__update` changes a question or withdraws it with a reason. You
  see a changed question as edited. A withdrawn question stays in the list
  with its reason until you dismiss it, with its button or `/pocket dismiss`.
- `mcp__pocket__list` lists the open questions.

The tools never raise a permission prompt. Only the main session pockets
questions: a subagent gets an error that tells it to return its question to
its caller.

Trust: Claude writes every text in a question, and only the answer has your
authority. So no tool answers a question. An answer comes only from a button
press, or from a `/pocket` command typed at the terminal or sent through
Remote Control. A `/pocket` answer from any other origin is refused. Claude
cannot tell the answer line from a message you typed, so this check is the
whole protection.

Questions live in `~/.claude/pocket/<project>/`, one JSON file each, so they
survive a compaction and a restart. A closed question moves to `done/` there.
After a compaction, and at the start of a session, Claude is told which
questions are open. A second session in the same project sees the same
questions. An answer goes to the session where you give it.

What it does not do:

- An answer does not reach Claude in the middle of a turn. It waits for the
  turn to end.
- A session shows a change that another session made only after its next turn
  or its next `/pocket`.
- Two sessions that pocket a question in the same instant can take the same
  id. The later file then replaces the earlier one.
- An answer that was not delivered goes out again only from the session that
  took it. If that session never returns, read the answer from the file.
- It has no view of what is running.

Run the tests with `claude plugin test pocket`.
