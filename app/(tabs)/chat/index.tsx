import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, RefreshCw, Send, WifiOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useSync } from '@/contexts/SyncContext';
import UserAvatar from '@/components/UserAvatar';
import LaserBackground from '@/components/LaserBackground';
import {
  ChatMessage,
} from '@/types';
import {
  createChatMessage,
  deleteChatMessage,
  getChatMessageCount,
  getChatMessages,
  upsertChatMessagesFromServer,
} from '@/services/database';
import {
  ensureBoundChatSession,
  fetchChatMessagesFromSupabase,
  isSupabaseConfigured,
  supabase,
  toSyncableImageUrl,
} from '@/services/supabase';

const LOCAL_PAGE_SIZE = 50;

function formatTimestamp(value: string, pending: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return pending ? 'Pending sync' : 'Unknown time';
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const dayPart = sameDay
    ? 'Today'
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return pending ? `${dayPart} • ${timePart} • Pending` : `${dayPart} • ${timePart}`;
}

function getMessagePreview(messageText: string): string {
  return messageText.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function mapRealtimeMessage(record: Record<string, unknown>): ChatMessage {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    userName: typeof record.user_name === 'string' ? record.user_name : 'Unknown User',
    userAvatarUrl: typeof record.user_avatar_url === 'string' ? record.user_avatar_url : null,
    localAvatarUri: null,
    messageText: typeof record.message_text === 'string' ? record.message_text : '',
    createdAt: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
    updatedAt: typeof record.updated_at === 'string' ? record.updated_at : (typeof record.created_at === 'string' ? record.created_at : new Date().toISOString()),
    syncStatus: 'synced',
  };
}

export default function ChatScreen() {
  const { user, settings } = useAuth();
  const {
    queueDeletion,
    triggerFullSync,
    checkPendingCount,
    isOnline,
    syncStatus,
    syncChatMessageNow,
    syncChatDeletionNow,
  } = useSync();
  const queryClient = useQueryClient();
  const theme = settings.darkMode ? Colors.dark : Colors.light;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isAndroidTablet = Platform.OS === 'android' && Math.min(width, height) >= 600;
  const useLeftRailLayout = isLandscape && width >= 900;
  const insets = useSafeAreaInsets();
  const leftRailWidth = 108;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const latestVisibleRef = useRef(true);
  const lastSeenLatestMessageIdRef = useRef<string | null>(null);

  const [draftMessage, setDraftMessage] = useState('');
  const [pageSize, setPageSize] = useState(LOCAL_PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingEarlierRemote, setIsLoadingEarlierRemote] = useState(false);
  const [hasReachedRemoteHistoryEnd, setHasReachedRemoteHistoryEnd] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const contentMaxWidth = useMemo(() => {
    if (useLeftRailLayout) return Math.min(1120, width - leftRailWidth - 48);
    if (isAndroidTablet) return Math.min(900, width - 32);
    return width - 24;
  }, [isAndroidTablet, leftRailWidth, useLeftRailLayout, width]);

  const bubbleMaxWidth = useMemo(() => {
    if (isAndroidTablet && isLandscape) return Math.min(620, Math.floor(contentMaxWidth * 0.56));
    if (isAndroidTablet) return Math.min(580, Math.floor(contentMaxWidth * 0.68));
    return Math.min(420, Math.floor(contentMaxWidth * 0.76));
  }, [contentMaxWidth, isAndroidTablet, isLandscape]);

  const bottomNavigationHeight = useMemo(() => {
    if (useLeftRailLayout) {
      return 0;
    }

    return 80 + insets.bottom;
  }, [insets.bottom, useLeftRailLayout]);

  const headerTopPadding = useMemo(() => {
    if (useLeftRailLayout) return 2;
    return isAndroidTablet ? 2 : 0;
  }, [isAndroidTablet, useLeftRailLayout]);

  const headerBottomPadding = useMemo(() => {
    if (useLeftRailLayout) return 8;
    return isAndroidTablet ? 8 : 6;
  }, [isAndroidTablet, useLeftRailLayout]);

  const chatCardTopMargin = useMemo(() => {
    if (useLeftRailLayout) return 8;
    return isAndroidTablet ? 8 : 6;
  }, [isAndroidTablet, useLeftRailLayout]);

  const composerTopGap = useMemo(() => {
    if (useLeftRailLayout) return 6;
    return isAndroidTablet ? 8 : 6;
  }, [isAndroidTablet, useLeftRailLayout]);

  const composerMenuGap = useMemo(() => {
    if (useLeftRailLayout) return 12;
    return isAndroidTablet ? 12 : 10;
  }, [isAndroidTablet, useLeftRailLayout]);

  const listVerticalPadding = useMemo(() => {
    return isAndroidTablet ? 8 : 6;
  }, [isAndroidTablet]);

  const composerBottomSpacing = useMemo(() => {
    if (useLeftRailLayout) {
      return insets.bottom + composerMenuGap;
    }

    return isKeyboardVisible ? insets.bottom + 8 : bottomNavigationHeight + composerMenuGap;
  }, [bottomNavigationHeight, composerMenuGap, insets.bottom, isKeyboardVisible, useLeftRailLayout]);

  const scrollToLatest = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  const maybeShowImmediateSyncAlert = useCallback((title: string, message?: string, code?: string) => {
    if (!message || !code || code === 'offline') {
      return;
    }

    Alert.alert(title, message);
  }, []);

  const invalidateChatQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['chatMessages'] });
    queryClient.invalidateQueries({ queryKey: ['chatMessageCount'] });
  }, [queryClient]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsKeyboardVisible(true);
      scrollToLatest(false);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [scrollToLatest]);

  const { data: messages = [] } = useQuery({
    queryKey: ['chatMessages', pageSize],
    queryFn: () => getChatMessages({ limit: pageSize }),
    enabled: !!user,
  });

  const { data: totalMessageCount = 0 } = useQuery({
    queryKey: ['chatMessageCount'],
    queryFn: getChatMessageCount,
    enabled: !!user,
  });

  const oldestLoadedAt = messages[messages.length - 1]?.createdAt ?? null;
  const hasMoreLocalMessages = totalMessageCount > messages.length;
  const canLoadEarlier = hasMoreLocalMessages || (!hasReachedRemoteHistoryEnd && isOnline && !!oldestLoadedAt);

  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      if (!user) {
        throw new Error('User not available');
      }

      const trimmedText = messageText.trim();
      if (!trimmedText) {
        throw new Error('Message cannot be empty');
      }

      return createChatMessage({
        userId: user.id,
        userName: user.name,
        userAvatarUrl: toSyncableImageUrl(user.profilePicture),
        localAvatarUri: user.profilePicture ?? null,
        messageText: trimmedText,
      });
    },
    onSuccess: async createdMessage => {
      invalidateChatQueries();
      await checkPendingCount();
      Haptics.selectionAsync();
      scrollToLatest(false);

      void syncChatMessageNow(createdMessage).then(async result => {
        invalidateChatQueries();
        await checkPendingCount();
        maybeShowImmediateSyncAlert('Message saved locally', result.message, result.code);
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (message: ChatMessage) => {
      await queueDeletion('chat_messages', message.id, {
        name: getMessagePreview(message.messageText),
        date: message.createdAt,
      });
      await deleteChatMessage(message.id);
      return message.id;
    },
    onSuccess: async messageId => {
      invalidateChatQueries();
      await checkPendingCount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      void syncChatDeletionNow(messageId).then(async result => {
        invalidateChatQueries();
        await checkPendingCount();
        maybeShowImmediateSyncAlert('Message deleted locally', result.message, result.code);
      });
    },
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await triggerFullSync({ reason: 'manual' });
      invalidateChatQueries();
    } finally {
      setIsRefreshing(false);
    }
  }, [invalidateChatQueries, triggerFullSync]);

  const handleSend = useCallback(async () => {
    const trimmedText = draftMessage.trim();
    if (!trimmedText || sendMessageMutation.isPending) {
      return;
    }

    setDraftMessage('');

    try {
      await sendMessageMutation.mutateAsync(trimmedText);
    } catch (error) {
      setDraftMessage(trimmedText);
      Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
    }
  }, [draftMessage, sendMessageMutation]);

  const canDeleteMessage = useCallback((message: ChatMessage) => {
    if (!user) return false;
    return message.userId === user.id || user.role === 'developer';
  }, [user]);

  const confirmDeleteMessage = useCallback((message: ChatMessage) => {
    if (!canDeleteMessage(message)) {
      Alert.alert('Delete not allowed', 'You can only delete your own messages.');
      return;
    }

    Alert.alert(
      'Delete message',
      'This will remove the message locally right away and sync the deletion to Supabase.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMessageMutation.mutate(message),
        },
      ]
    );
  }, [canDeleteMessage, deleteMessageMutation]);

  const loadEarlierMessages = useCallback(async () => {
    if (hasMoreLocalMessages) {
      setPageSize(currentPageSize => currentPageSize + LOCAL_PAGE_SIZE);
      return;
    }

    if (!oldestLoadedAt || !isOnline || !isSupabaseConfigured() || isLoadingEarlierRemote) {
      return;
    }

    setIsLoadingEarlierRemote(true);
    try {
      const olderMessages = await fetchChatMessagesFromSupabase({
        limit: LOCAL_PAGE_SIZE,
        beforeCreatedAt: oldestLoadedAt,
        user: user ?? undefined,
      });

      if (!olderMessages || olderMessages.length === 0) {
        setHasReachedRemoteHistoryEnd(true);
        return;
      }

      await upsertChatMessagesFromServer(olderMessages);
      invalidateChatQueries();
      setPageSize(currentPageSize => currentPageSize + olderMessages.length);

      if (olderMessages.length < LOCAL_PAGE_SIZE) {
        setHasReachedRemoteHistoryEnd(true);
      }
    } catch {
      Alert.alert('Unable to load earlier messages', 'Please try again in a moment.');
    } finally {
      setIsLoadingEarlierRemote(false);
    }
  }, [hasMoreLocalMessages, invalidateChatQueries, isLoadingEarlierRemote, isOnline, oldestLoadedAt, user]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      invalidateChatQueries();
      if (isOnline) {
        triggerFullSync({ reason: 'auto' }).finally(() => {
          invalidateChatQueries();
        });
      }
    }, [invalidateChatQueries, isOnline, triggerFullSync, user])
  );

  useEffect(() => {
    const realtimeClient = supabase;
    if (!realtimeClient || !isSupabaseConfigured() || !user) {
      return;
    }

    let isCancelled = false;
    let channel: ReturnType<typeof realtimeClient.channel> | null = null;

    const subscribeToChat = async () => {
      const authResult = await ensureBoundChatSession(user);
      if (!authResult.ok || isCancelled) {
        console.log('Chat realtime unavailable:', authResult.message);
        return;
      }

      channel = realtimeClient
        .channel(`global-chat-${user.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          async payload => {
            await upsertChatMessagesFromServer([mapRealtimeMessage(payload.new as Record<string, unknown>)]);
            invalidateChatQueries();
            if (latestVisibleRef.current) {
              scrollToLatest();
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
          async payload => {
            await upsertChatMessagesFromServer([mapRealtimeMessage(payload.new as Record<string, unknown>)]);
            invalidateChatQueries();
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_messages' },
          async payload => {
            const messageId = typeof payload.old?.id === 'string' ? payload.old.id : null;
            if (!messageId) return;
            await deleteChatMessage(messageId);
            invalidateChatQueries();
            await checkPendingCount();
          }
        );

      channel.subscribe(status => {
        console.log('Chat realtime status:', status);
      });
    };

    void subscribeToChat();

    return () => {
      isCancelled = true;
      if (channel) {
        realtimeClient.removeChannel(channel);
      }
    };
  }, [checkPendingCount, invalidateChatQueries, scrollToLatest, user]);

  useEffect(() => {
    const latestMessageId = messages[0]?.id ?? null;
    if (!latestMessageId) {
      lastSeenLatestMessageIdRef.current = null;
      return;
    }

    const previousLatestMessageId = lastSeenLatestMessageIdRef.current;
    lastSeenLatestMessageIdRef.current = latestMessageId;

    if (!previousLatestMessageId || previousLatestMessageId === latestMessageId) {
      return;
    }

    if (latestVisibleRef.current) {
      scrollToLatest();
    }
  }, [messages, scrollToLatest]);

  if (!user) {
    return null;
  }

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.userId === user.id;
    const avatarUri = item.localAvatarUri || item.userAvatarUrl || null;

    return (
      <Pressable
        onLongPress={() => confirmDeleteMessage(item)}
        style={[
          styles.messageRow,
          isOwnMessage ? styles.messageRowOwn : styles.messageRowOther,
        ]}
      >
        {!isOwnMessage && (
          <UserAvatar
            name={item.userName}
            imageUri={avatarUri}
            size={38}
            backgroundColor={theme.cardHighlight}
            borderColor={theme.cardBorder}
            textColor={theme.textSecondary}
          />
        )}

        <View
          style={[
            styles.messageColumn,
            isOwnMessage ? styles.messageColumnOwn : styles.messageColumnOther,
            { maxWidth: bubbleMaxWidth + 20 },
          ]}
        >
          <Text
            style={[
              styles.senderName,
              { color: isOwnMessage ? theme.primaryLight : theme.textSecondary, textAlign: isOwnMessage ? 'right' : 'left' },
            ]}
          >
            {item.userName}
          </Text>

          <View
            style={[
              styles.messageBubble,
              {
                backgroundColor: isOwnMessage ? theme.primary : theme.card,
                borderColor: isOwnMessage ? theme.primaryLight : theme.cardBorder,
                maxWidth: bubbleMaxWidth,
              },
            ]}
          >
            <Text style={[styles.messageText, { color: isOwnMessage ? '#ffffff' : theme.text }]}>
              {item.messageText}
            </Text>
          </View>

          <Text
            style={[
              styles.timestamp,
              { color: theme.textMuted, textAlign: isOwnMessage ? 'right' : 'left' },
            ]}
          >
            {formatTimestamp(item.createdAt, item.syncStatus === 'pending')}
          </Text>
        </View>

        {isOwnMessage && (
          <UserAvatar
            name={item.userName}
            imageUri={avatarUri}
            size={38}
            backgroundColor={theme.cardHighlight}
            borderColor={theme.cardBorder}
            textColor={theme.textSecondary}
          />
        )}
      </Pressable>
    );
  };

  const chatContent = (
    <>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.divider,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            paddingTop: headerTopPadding,
            paddingBottom: headerBottomPadding,
          },
        ]}
      >
        <View style={styles.headerCopy}>
          <View style={[styles.headerIcon, { backgroundColor: theme.primary + '20' }]}>
            <MessageCircle color={theme.primary} size={22} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Global Chat</Text>
            <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
              Everyone in the app shares this one conversation.
            </Text>
          </View>
        </View>

        <View style={styles.headerStatus}>
          <TouchableOpacity
            style={[styles.statusChip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            onPress={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw color={theme.primary} size={14} />
            <Text style={[styles.statusText, { color: theme.primary }]}>
              {isRefreshing ? 'Refreshing' : 'Refresh'}
            </Text>
          </TouchableOpacity>
          {!isOnline && (
            <View style={[styles.statusChip, { backgroundColor: theme.error + '18', borderColor: theme.error + '35' }]}>
              <WifiOff color={theme.error} size={14} />
              <Text style={[styles.statusText, { color: theme.error }]}>Offline</Text>
            </View>
          )}
          {isOnline && syncStatus === 'syncing' && (
            <View style={[styles.statusChip, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '35' }]}>
              <RefreshCw color={theme.primary} size={14} />
              <Text style={[styles.statusText, { color: theme.primary }]}>Syncing</Text>
            </View>
          )}
        </View>
      </View>

      <View
        style={[
          styles.chatCard,
          {
            backgroundColor: theme.card + 'E6',
            borderColor: theme.cardBorder,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            marginTop: chatCardTopMargin,
          },
        ]}
      >
        <FlatList
          ref={listRef}
          data={messages}
          inverted
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={event => {
            latestVisibleRef.current = event.nativeEvent.contentOffset.y <= 48;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingTop: listVerticalPadding,
              paddingBottom: listVerticalPadding,
            },
            messages.length === 0 && styles.emptyListContent,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '18' }]}>
                <MessageCircle color={theme.primary} size={26} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No messages yet</Text>
              <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                Start the conversation. Messages save locally first and sync automatically when the network is available.
              </Text>
            </View>
          }
          ListFooterComponent={
            canLoadEarlier ? (
              <TouchableOpacity
                style={[styles.loadEarlierButton, { borderColor: theme.cardBorder, backgroundColor: theme.cardHighlight }]}
                onPress={loadEarlierMessages}
                disabled={isLoadingEarlierRemote}
              >
                {isLoadingEarlierRemote ? (
                  <RefreshCw color={theme.primary} size={16} />
                ) : (
                  <Text style={[styles.loadEarlierText, { color: theme.primary }]}>Load earlier messages</Text>
                )}
              </TouchableOpacity>
            ) : <View style={styles.loadEarlierSpacer} />
          }
        />
      </View>

      <View
        style={[
          styles.composerOuter,
          {
            paddingBottom: composerBottomSpacing,
            paddingTop: composerTopGap,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
          },
        ]}
      >
        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.card,
              borderColor: theme.cardBorder,
              paddingVertical: isAndroidTablet ? 8 : 7,
            },
          ]}
        >
          <TextInput
            style={[styles.input, { color: theme.text }]}
            placeholder="Write a message"
            placeholderTextColor={theme.textMuted}
            value={draftMessage}
            onChangeText={setDraftMessage}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                backgroundColor: draftMessage.trim() ? theme.primary : theme.inputBorder,
                opacity: sendMessageMutation.isPending ? 0.8 : 1,
              },
            ]}
            onPress={handleSend}
            disabled={!draftMessage.trim() || sendMessageMutation.isPending}
          >
            <Send color="#ffffff" size={18} />
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={[theme.backgroundGradientStart, theme.backgroundGradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      {settings.laserBackground && (
        <LaserBackground
          isDarkMode={settings.darkMode}
          colorPalette={settings.backgroundColorPalette}
          intensity={settings.backgroundIntensity}
        />
      )}

      <SafeAreaView
        style={[styles.safeArea, useLeftRailLayout && { paddingLeft: leftRailWidth + 16, paddingRight: 16 }]}
        edges={['top']}
      >
        {(Platform.OS === 'ios' || Platform.OS === 'android') ? (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
          >
            {chatContent}
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.flex}>
            {chatContent}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    minHeight: 0,
  },
  flex: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    width: '100%',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chatCard: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadEarlierButton: {
    alignSelf: 'center',
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 40,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  loadEarlierText: {
    fontSize: 13,
    fontWeight: '600',
  },
  loadEarlierSpacer: {
    height: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginVertical: 8,
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageColumn: {
    gap: 5,
  },
  messageColumnOther: {
    alignItems: 'flex-start',
  },
  messageColumnOwn: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  messageBubble: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 4,
  },
  composerOuter: {
    width: '100%',
  },
  composer: {
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
