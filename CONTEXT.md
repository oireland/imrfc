# IMRFC Club Hub

The shared vocabulary for Imperial Medicals RFC's events and equipment-tracking app: where the club's equipment is, who is bringing it to and from each event, when events happen, and who is injured.

## People

**User**:
A person with an account in the app. Every user has exactly one Role and one Access State.
_Avoid_: Account, player (not every User is a Player), member (that is a Role)

**Role**:
A user's club-wide permission level: Member, Committee or Admin, each including everything below it.
_Avoid_: Permission, rank

**Member**:
The base Role: can see everything except other Players' Injuries, claim Duties, Confirm their own Duties, record Moves and report their own Injuries.

**Committee**:
The Role that runs things: creates and edits Events, Series, Equipment Units, Stores and Checklists, assigns or Confirms any Duty, and sees every Player's Injuries. Captains are Committee.
_Avoid_: Captain, organiser, equipment manager (as system concepts)

**Admin**:
The Role that controls access: approves and blocks Users and changes Roles.

**Access State**:
Whether a User may use the app: Pending (signed up, awaiting approval), Approved, or Blocked.
_Avoid_: Status (reserved for Equipment Units), active/inactive

## Players

**Player**:
A User who plays: every User unless they have switched Playing off.
_Avoid_: Squad member, athlete

**Playing**:
Whether a User counts as a Player. On unless the User or Committee switches it off.

**Position**:
Where a Player plays, from a fixed list of specific positions (Loosehead Prop (1) … Fullback (15)). Each Player has one **Preferred Position** and any number of **Other Positions**.
_Avoid_: Role (that is a permission level)

**Injury**:
Something a Player has hurt, reported by them or by Committee, with a body area, description, the date it happened and an Injury Status. Kept as history once Cleared; one entered in error is Logged by mistake, never deleted.
_Avoid_: Knock, niggle

**Injury Status**:
Where an Injury stands: Out (can't play), Playing through it (can play, still carrying it) or Cleared (over).
_Avoid_: Status on its own

**Expected Return**:
The date a Player expects to stop being Out with an Injury. Optional.

**Fitness**:
A Player's state on a given date, taken from their worst open Injury: Out, Playing through it, or Fit.
_Avoid_: Availability (whether someone can make an Event, for any reason, is a separate concept)

**Concussion**:
An Injury flagged as a concussion. It follows the RFU's graduated return, shows an Earliest Match, and only Committee can Clear it.

**Symptom-free Date**:
The day since which a concussed Player has had no symptoms at rest. Cleared if symptoms come back.

**Earliest Match**:
The first date a concussed Player may play a match under the graduated return; there is also an earliest date for contact training. Guidance only; it never clears the Concussion.

**Physio Summary**:
Text listing the club's current and recently Cleared Injuries, formatted for sending to the physio before a Match.

## Availability

**Availability**:
A Player's reply to whether they can make a Training or Match: Available, Not available, or No reply. For Matches, one reply covers every Match that day.
_Avoid_: Vote, RSVP, poll, attendance

**Available**:
The Player can make the Event. May carry a note ("late").

**Not available**:
The Player can't make the Event. Always has a Reason.

**No reply**:
A Player who hasn't answered yet — the people who need chasing.
_Avoid_: Pending (that is an Access State), unanswered

**Reason**:
Why a Player is Not available. Seen only by Committee and that Player.

**Reply By**:
An optional deadline set when Announcing. Replies after it are marked late; nothing is enforced.
_Avoid_: Deadline, cut-off

**Announce**:
Committee emailing every Player with No reply to ask whether they can make an Event. Done once per Event (once per day for Matches).
_Avoid_: Publish, invite

**Nudge**:
Committee emailing a reminder to Players with No reply — all of them or chosen ones.
_Avoid_: Chase, ping, reminder (as the action's name)

## Places

**Venue**:
Where an Event happens, written as free text on the Event (a ground's name, a pub, an away team's address). Venues are not kept as records of their own.
_Avoid_: Location, ground (as system concepts)

**Store**:
A named place with an address where Equipment Units are kept between Events. The only kind of place the app keeps as a record.
_Avoid_: Location, storage, cupboard, shed (these last are names of Stores, not the concept)

## Equipment

**Equipment Unit**:
A named, trackable piece of club equipment, or several interchangeable ones counted by a Quantity (e.g. "Ball bag A", "Tackle shields" ×8, "Cones" ×2 sets, "Bibs – orange").
_Avoid_: Item, kit, equipment (when referring to one thing)

**Quantity**:
How many of an Equipment Unit the club has, in whatever counts naturally for it (8 shields, 2 sets of cones). Defaults to 1 and is only shown when more than 1. Counts things that travel separately, never the contents of a container (the balls in a ball bag).
_Avoid_: Stock, amount, number

**Home**:
The Store an Equipment Unit normally returns to; the default Destination for its From Duties.
_Avoid_: Default location

**Equipment Status**:
Whether an Equipment Unit is in circulation: Active, Missing or Retired. It applies to the whole unit; losing some of a counted unit lowers its Quantity instead. Only Active units can go on a Checklist. Equipment Units are never deleted.

**Condition Note**:
Free text describing an Equipment Unit's current state (e.g. "2 balls need pumping").

**Whereabouts**:
Where an Equipment Unit is right now: at a Store, with a Holder, or Unconfirmed. A counted Equipment Unit can be split across several places, each with a count ("4 at the Shed, 4 with Sam"); the counts always add up to its Quantity.
_Avoid_: Location, position

**Holder**:
The User an Equipment Unit is currently with.
_Avoid_: Owner, keeper

**Unconfirmed**:
The Whereabouts of an Equipment Unit whose From Duty was never Confirmed; shown as "last seen at" the Event.

**Move**:
A recorded change of an Equipment Unit's Whereabouts, either by Confirming a Duty or ad hoc ("I've got it", "give it to Priya", "put it in the Shed"). For a counted unit a Move carries a count and the place it came from.
_Avoid_: Transfer, check-in/check-out

**Movement Log**:
The permanent history of every Move and Condition Note change for an Equipment Unit.
_Avoid_: Audit trail

## Events

**Event**:
A dated club happening at a Venue: a Training, a Match or a Social.
_Avoid_: Fixture (a Match is a fixture; not all Events are), session

**Event Type**:
One of Training, Match or Social. It decides which extra details the Event has and supplies the Default Checklist.

**Team**:
A club side (1st XV, 2nd XV). Events are tagged with zero or more Teams as a label; no tag means whole club. Users do not belong to Teams.
_Avoid_: Squad, XV (except in Team names)

**Kick-off**:
The start time of a Match.

**Meet Time**:
When players should arrive at the Venue for a Match.

**Travel Meet Time**:
When and where players meet to travel together to an away Match.

**Series**:
A recurring pattern of Training (e.g. "Wednesdays 19:00, Harlington, until 10 Dec") that produces Occurrences.
_Avoid_: Recurrence, schedule

**Occurrence**:
An Event produced by a Series. It can be edited on its own ("this one") or with every later Occurrence ("this and future").

**Cancelled**:
An Event that will not happen but stays visible, marked as cancelled.
_Avoid_: Deleted

## Duties

**Checklist**:
The Equipment Units an Event needs, each with how many (all of them unless lowered). Resolved in order: Event's own Checklist, else its Series' Checklist, else its Event Type's Default Checklist.
_Avoid_: Equipment list, requirements

**Default Checklist**:
The Checklist an Event Type supplies to Events that don't override it.

**Duty**:
Responsibility of one or more Users to carry one Equipment Unit (the count its Checklist asks for) for one Event, in one direction.
_Avoid_: Job, task, assignment (that's how a Duty gets filled)

**To Duty**:
The Duty to bring an Equipment Unit from its Whereabouts to the Event.

**From Duty**:
The Duty to take an Equipment Unit from the Event to a Destination. It goes to the To Duty's Users unless handed to someone else.

**Destination**:
Where a From Duty ends: a Store, or the Duty's Users becoming Holders. Defaults to the Equipment Unit's Home.

**Claim**:
A User taking a Duty for themselves, or joining the Users already on it.
_Avoid_: Volunteer, sign up

**Assign**:
A Committee User putting one or more named Users on a Duty.

**Confirm**:
Marking a Duty as done, which records a Move. Only a Confirmed Duty changes an Equipment Unit's Whereabouts.
_Avoid_: Complete, tick off, check in

**Clash**:
A warning that an Equipment Unit is double-booked: Events that overlap, or that are back-to-back with nobody taking it away from the first, between them need more of it than its Quantity. Clashes warn; they never block.
_Avoid_: Conflict, error

**Heads-up**:
A gentler warning about an Event's equipment plan that isn't a Clash: nobody is on a Duty and the Event starts within 48 hours, an Equipment Unit on the Checklist is Missing or Retired, or the Holder needs to pass an Equipment Unit to whoever is bringing it.
_Avoid_: Clash (for these), alert

**Duty Summary**:
Text summarising an Event and its Duties, formatted for pasting into the club WhatsApp group.

## Calendar

**Calendar Feed**:
A User's private subscribable calendar (ICS) of all Events, with that User's own Duties written into each Event's description.

**Feed Token**:
The secret in a Calendar Feed's URL. The User can reset it; it stops working when they are Blocked.

## Notifications

**Push notification**:
A message the app sends straight to a User's phone or browser (via the Notifications toggle on Profile), for a morning-of reminder or alongside Announce/Nudge.
_Avoid_: Alert, ping

**Subscription**:
One browser or device's registration to receive Push notifications for a User. A User with notifications on more than one device has more than one Subscription.
_Avoid_: Device (a Subscription belongs to a device, but isn't the device itself)
