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
The Role that runs things: creates and edits Events, Series, Kit Units, Locations and Checklists, and assigns or Confirms any Duty. Captains are Committee.
_Avoid_: Captain, organiser, kit manager (as system concepts)

**Admin**:
The Role that controls access: approves and blocks Users and changes Roles.

**Access State**:
Whether a User may use the app: Pending (signed up, awaiting approval), Approved, or Blocked.
_Avoid_: Status (reserved for Kit Units), active/inactive

## Places

**Location**:
A named physical place with an address. A Location can be a Venue, a Store, or both.
_Avoid_: Place, site, ground

**Venue**:
A Location where Events happen.

**Store**:
A Location where Kit Units are kept between Events.
_Avoid_: Storage, cupboard, shed (these are names of Stores, not the concept)

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
_Avoid_: Location (that is a place, not a Kit Unit's state), position

**Holder**:
The User a Kit Unit is currently with.
_Avoid_: Owner, keeper

**Unconfirmed**:
The Whereabouts of a Kit Unit whose From Duty was never Confirmed; shown as "last seen at" the Event.

**Move**:
A recorded change of a Kit Unit's Whereabouts, either by Confirming a Duty or ad hoc ("I've got it now").
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
A warning that a Kit Unit's plan looks wrong, e.g. it is on two Checklists at overlapping times, or its Holder has no Duty for an Event that needs it. Clashes warn; they never block.
_Avoid_: Conflict, error

**Duty Summary**:
Text summarising an Event and its Duties, formatted for pasting into the club WhatsApp group.

## Calendar

**Calendar Feed**:
A User's private subscribable calendar (ICS) of all Events, with that User's own Duties written into each Event's description.

**Feed Token**:
The secret in a Calendar Feed's URL. The User can reset it; it stops working when they are Blocked.
