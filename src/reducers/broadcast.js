// @flow
import R from 'ramda';
import { isFan } from '../services/util';

const participantState = (stream?: Stream | null = null): ParticipantState => ({
  connected: !!stream,
  stream,
  networkQuality: null,
  video: !!R.prop('hasVideo', stream || {}),
  audio: !!R.prop('hasAudio', stream || {}),
  volume: 100,
});

const initialChatState = (fromType: ChatUser, fromId?: UserId, toType: ChatUser, to: UserWithConnection): ChatState => {
  const chatIncludesFan = !!R.find(isFan, [fromType, toType]);
  const session: SessionName = chatIncludesFan ? 'backstage' : 'stage';
  const chatId = isFan(toType) ? R.prop('id', to) : toType;
  return {
    chatId,
    session,
    fromType,
    fromId,
    toType,
    to,
    displayed: true,
    minimized: false,
    messages: [],
    inPrivateCall: R.defaultTo(false)(R.prop('inPrivateCall', to)),
  };
};

const initialState = (): BroadcastState => ({
  event: null,
  connecting: false,
  connected: false,
  backstageConnected: false,
  publishOnlyEnabled: false,
  privateCall: null,
  publishers: {
    camera: null,
  },
  subscribers: {
    camera: null,
  },
  meta: null,
  participants: {
    fan: participantState(),
    celebrity: participantState(),
    host: participantState(),
    backstageFan: participantState(),
  },
  activeFans: {
    map: {},
    order: [],
  },
  chats: {},
  stageCountdown: -1,
  viewers: 0,
  interactiveLimit: 0,
  archiving: false,
  reconnecting: false,
  disconnected: false,
  elapsedTime: '--:--:--',
  fanTransition: false,
});

const activeFansUpdate = (activeFans: ActiveFans, update: ActiveFanMap): ActiveFans => {
  const currentOrder = R.prop('order', activeFans);
  const buildOrder = (): UserId[] => {
    const fanLeftLine = R.gt(R.length(currentOrder), R.length(R.keys(update)));
    if (R.isEmpty(currentOrder)) {
      return R.keys(update);
    }
    if (fanLeftLine) {
      return R.without(R.without(R.keys(update), currentOrder), currentOrder);
    }
    return R.concat(currentOrder, R.without(currentOrder, R.keys(update)));
  };

  return { map: R.defaultTo({})(update), order: buildOrder() };
};

// Reorder the active fans array
const updateFanOrder = (activeFans: ActiveFans, update: ActiveFanOrderUpdate): ActiveFans => {
  const { order } = activeFans;
  const { oldIndex, newIndex } = update;
  return R.insert(newIndex, order[oldIndex], R.remove(oldIndex, 1, order));
};

const broadcast = (state: BroadcastState = initialState(), action: BroadcastAction): BroadcastState => {
  switch (action.type) {
    case 'FAN_TRANSITION':
      return R.assoc('fanTransition', action.fanTransition, state);
    case 'SET_RECONNECTING':
      return R.assoc('reconnecting', action.reconnecting, state);
    case 'SET_DISCONNECTED':
      return R.assoc('disconnected', action.disconnected, state);
    case 'SET_PUBLISH_ONLY_ENABLED':
      return R.assoc('publishOnlyEnabled', action.publishOnlyEnabled, state);
    case 'BROADCAST_PARTICIPANT_JOINED':
      return R.assocPath(['participants', action.participantType], participantState(action.stream), state);
    case 'BROADCAST_PARTICIPANT_LEFT':
      return R.assocPath(['participants', action.participantType], participantState(), state);
    case 'PARTICIPANT_AV_PROPERTY_CHANGED':
      return R.assocPath(['participants', action.participantType, action.update.property], action.update.value, state);
    case 'SET_BROADCAST_STATE':
      return R.merge(action.state, state);
    case 'SET_BROADCAST_EVENT':
      return R.assoc('event', action.event, state);
    case 'SET_BROADCAST_EVENT_STATUS':
      return R.assoc('event', R.assoc('status', action.status, state.event), state);
    case 'SET_BROADCAST_EVENT_SHOW_STARTED':
      return R.assoc('event', R.assoc('showStartedAt', action.showStartedAt, state.event), state);
    case 'SET_ELAPSED_TIME':
      return R.assoc('elapsedTime', action.elapsedTime, state);
    case 'BROADCAST_CONNECTED':
      return R.assoc('connected', action.connected, state);
    case 'PRESENCE_CONNECTING':
      return R.assoc('connecting', action.connecting, state);
    case 'BACKSTAGE_CONNECTED':
      return R.assoc('backstageConnected', action.connected, state);
    case 'SET_PRIVATE_CALL_STATE':
      return R.assoc('privateCall', action.privateCall, state);
    case 'RESET_BROADCAST_EVENT':
      return initialState();
    case 'UPDATE_ACTIVE_FANS':
      return R.assoc('activeFans', activeFansUpdate(state.activeFans, action.update), state);
    case 'UPDATE_ACTIVE_FAN_RECORD':
      return R.assocPath(['participants', action.fanType, 'record'], action.record, state);
    case 'UPDATE_VIEWERS':
      return R.assoc('viewers', action.viewers, state);
    case 'SET_ARCHIVING':
      return R.assoc('archiving', action.archiving, state);
    case 'SET_INTERACTIVE_LIMIT':
      return R.assoc('interactiveLimit', action.interactiveLimit, state);
    case 'REORDER_BROADCAST_ACTIVE_FANS':
      return R.assocPath(['activeFans', 'order'], updateFanOrder(state.activeFans, action.update), state);
    case 'START_NEW_FAN_CHAT':
      {
        const activeOrBackstageFan = R.either(R.propEq('toType', 'activeFan'), R.propEq('toType', 'backstageFan'));
        const minimizeActiveFanChat = (chat: ChatState): ChatState => activeOrBackstageFan(chat) ? R.assoc('minimized', true, chat) : chat;
        const minimizedChats = R.assoc('chats', R.map(minimizeActiveFanChat, state.chats), state);
        const newChat = initialChatState('producer', undefined, action.toType, action.fan);
        return R.assocPath(['chats', action.fan.id], newChat, minimizedChats);
      }
    case 'START_NEW_PARTICIPANT_CHAT':
      {
        const { participant, participantType } = action;
        return R.assocPath(['chats', participantType], initialChatState('producer', undefined, participantType, participant), state);
      }
    case 'START_NEW_PRODUCER_CHAT':
      return R.assocPath(['chats', 'producer'], initialChatState(action.fromType, action.fromId, 'producer', action.producer), state);
    case 'UPDATE_CHAT_PROPERTY':
      return R.assocPath(['chats', action.chatId, action.property], action.update, state);
    case 'DISPLAY_CHAT':
      return R.assocPath(['chats', action.chatId, 'displayed'], action.display, state);
    case 'REMOVE_CHAT':
      return R.dissocPath(['chats', action.chatId], state);
    case 'NEW_CHAT_MESSAGE':
      return R.assocPath(['chats', action.chatId, 'messages'], R.append(action.message, R.path(['chats', action.chatId, 'messages'], state)), state);
    case 'MINIMIZE_CHAT':
      {
        let modifiedState;
        if (R.contains('activeFan', action.chatId)) {
          const minimizeActiveFanChat = (chat: ChatState): ChatState =>
            R.propEq('toType', 'activeFan', chat) ? R.assoc('minimized', true, chat) : chat;
          modifiedState = R.assoc('chats', R.map(minimizeActiveFanChat, state.chats), state);
        } else {
          modifiedState = state;
        }
        return R.assocPath(['chats', action.chatId, 'minimized'], action.minimize, modifiedState);

      }
    case 'UPDATE_STAGE_COUNTDOWN':
      return R.assoc('stageCountdown', action.stageCountdown, state);
    default:
      return state;
  }
};


export default broadcast;
