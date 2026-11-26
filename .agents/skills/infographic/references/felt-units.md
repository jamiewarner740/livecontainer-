# Felt units: making a finding land

An argument page can pass every check in this skill and still land nothing.
The measured case: a comparison of one developer's output against a 2.25-person
team over 75 days. Six blocks of equal weight, the finding in a subtitle, the
gap printed as "15.5x" and "451k against 29k lines". Every number was correct.
The person it was made for read it and said nothing stood out.

A ratio is a correct number that nobody feels. **The fix is not a bigger font on
the ratio. It is a different unit.**

## The rule

In `argument` mode, write `meta.lands_on` before any section: the one number or
image a reader should still repeat an hour later. It has to be in a unit the
reader lives in, and the section marked `"finding": true` has to draw it, first
or second on the page, as the largest drawing with the largest number.

| A bare ratio | The same fact in a felt unit |
|---|---|
| 15.5x the lines of code | at the team's pace, what one person wrote in 75 days would take them 3.2 years |
| 35x per person | one of his days is five weeks of theirs |
| 40% cheaper | the saving pays for two more hires a year |
| 0.3% error rate | one wrong invoice in every working day |
| 12 ms faster | a page that used to wait a blink now does not wait at all |

## The units that work

- **Time**: days, weeks, years, a calendar date. "Finishes in January 2030" lands
  harder than any multiple, because the reader can picture the date.
- **Money**: a salary, a monthly bill, something the reader has paid.
- **People**: headcount, a team, "the whole office".
- **Count of a thing they handle**: invoices, bookings, tickets, apartments.

## How to compute one honestly

- **Derive it, never estimate it.** A felt unit is the measured ratio multiplied
  back into a unit: `their_rate = their_total / their_days`, then
  `your_total / their_rate` days. Put that arithmetic in `footnotes`.
- **Name the assumption on the mark.** "At their measured pace" is three words
  and it is what makes the number fair. A projection that hides its assumption
  is the fabrication this skill bans.
- **Never extrapolate a trend that was not measured.** Constant pace is the
  only assumption allowed without a source.

## How to draw one

Draw both sides **on one scale**, because the gap is the finding and only a
shared scale shows it. Two calendar strips on one time axis, two stacks of the
same unit, two queues of the same people. A picture that draws one side in bars
and the other as a bare line has drawn two pictures, and the comparison is left
to the reader.

## What else must step back

- **Caveats are sized by consequence.** A caveat that would reverse the finding
  gets a `callout`. One that only qualifies it goes in `footnotes` or a `note`.
  A full coloured box of qualifications the same size as the finding tells the
  reader the page does not believe itself.
- **The title can still be literal.** The finding goes in the `subtitle` and in
  the drawing. A slogan title remains banned; a page whose biggest drawing is
  the finding does not need one.

## Checked by

- `ig.py brief`: refuses an argument brief with no `meta.lands_on`, with no
  section marked `"finding": true`, with more than one, or with it later than
  second.
- `ig.py blind`: question 7 asks the stranger which number they remember. "None",
  or a number other than `meta.lands_on`, is a failed page.
