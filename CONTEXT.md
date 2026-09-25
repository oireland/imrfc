# IMRFC Club Hub

The shared vocabulary for Imperial Medicals RFC's events and kit-tracking app: where the club's kit is, who is bringing it to and from each event, and when events happen.

## People

**User**:
A person with an account in the app. Every user has exactly one Role and one Access State.
_Avoid_: Account, player (not every user plays), member (that is a Role)

**Role**:
A user's club-wide permission level: Member, Committee or Admin, each including everything below it.
_Avoid_: Permission, rank

**Member**:
The base Role: can see everything, claim Duties, Confirm their own Duties and record Moves.

**Committee**:
The Role that runs things: creates and edits Events, Series, Kit Units, Stores and Checklists, and assigns or Confirms any Duty. Captains are Committee.
_Avoid_: Captain, organiser, kit manager (as system concepts)

**Admin**:
The Role that controls access: approves and blocks Users and changes Roles.

**Access State**:
Whether a User may use the app: Pending (signed up, awaiting approval), Approved, or Blocked.
_Avoid_: Status (reserved for Kit Units), active/inactive

## Places

**Venue**:
Where an Event happens, written as free text on the Event (a ground's name, a pub, an away team's address). Venues are not kept as records of their own.
_Avoid_: Location, ground (as system concepts)

**Store**:
A named place with an address where Kit Units are kept between Events. The only kind of place the app keeps as a record.
_Avoid_: Location, storage, cupboard, shed (these last are names of Stores, not the concept)

## Kit

**Kit Unit**:
A single named, trackable piece of club equipment, which may be a container of many things (e.g. "Ball bag A", "Tackle shields (set of 6)", "Bibs – orange").
_Avoid_: Item, equipment, kit (when referring to one thing)

**Home**:
The Store a Kit Unit normally returns to; the default Destination for its From Duties.
_Avoid_: Default location

**Kit Status**:
Whether a Kit Unit is in circulation: Active, Missing or Retired. Only Active units can go on a Checklist. Kit Units are never deleted.

**Condition Note**:
Free text describing a Kit Unit's current state (e.g. "2 balls need pumping").

**Whereabouts**:
Where a Kit Unit is right now: at a Store, with a Holder, or Unconfirmed.
_Avoid_: Location, position

**Holder**:
The User a Kit Unit is currently with.
_Avoid_: Owner, keeper

**Unconfirmed**:
The Whereabouts of a Kit Unit whose From Duty was never Confirmed; shown as "last seen at" the Event.

**Move**:
A recorded change of a Kit Unit's Whereabouts, either by Confirming a Duty or ad hoc ("I've got it", "give it to Priya", "put it in the Shed").
_Avoid_: Transfer, check-in/check-out

**Movement Log**:
The permanent history of every Move and Condition Note change for a Kit Unit.
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
The Kit Units an Event needs. Resolved in order: Event's own Checklist, else its Series' Checklist, else its Event Type's Default Checklist.
_Avoid_: Kit list, requirements

**Default Checklist**:
The Checklist an Event Type supplies to Events that don't override it.

**Duty**:
Responsibility of one User to carry one Kit Unit for one Event, in one direction.
_Avoid_: Job, task, assignment (that's how a Duty gets filled)

**To Duty**:
The Duty to bring a Kit Unit from its Whereabouts to the Event.

**From Duty**:
The Duty to take a Kit Unit from the Event to a Destination. It goes to the To Duty's User unless handed to someone else.

**Destination**:
Where a From Duty ends: a Store, or the Duty's User becoming Holder. Defaults to the Kit Unit's Home.

**Claim**:
A User taking an unfilled Duty for themselves.
_Avoid_: Volunteer, sign up

**Assign**:
A Committee User filling a Duty with a named User.

**Confirm**:
Marking a Duty as done, which records a Move. Only a Confirmed Duty changes a Kit Unit's Whereabouts.
_Avoid_: Complete, tick off, check in

**Clash**:
A warning that a Kit Unit is double-booked: it is on the Checklists of two Events that overlap, or that are back-to-back with nobody taking it away from the first. Clashes warn; they never block.
_Avoid_: Conflict, error

**Heads-up**:
A gentler warning about an Event's kit plan that isn't a Clash: nobody is on a Duty and the Event starts within 48 hours, a Kit Unit on the Checklist is Missing or Retired, or the Holder needs to pass a Kit Unit to whoever is bringing it.
_Avoid_: Clash (for these), alert

**Duty Summary**:
Text summarising an Event and its Duties, formatted for pasting into the club WhatsApp group.

## Calendar

**Calendar Feed**:
A User's private subscribable calendar (ICS) of all Events, with that User's own Duties written into each Event's description.

**Feed Token**:
The secret in a Calendar Feed's URL. The User can reset it; it stops working when they are Blocked.
