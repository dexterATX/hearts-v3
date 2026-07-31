// features/games/quiz/ui/QuizScreen.tsx — how well do you know me, scored together.
import { useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { Text, Button, Card, Skeleton } from '../../../../ui';
import { colors, spacing, radius } from '../../../../theme/theme';
import { useQuiz, useAddQuestion } from '../hooks';
import { useSession } from '../../../../lib/session/store';

function AddQuestionCard() {
  const add = useAddQuestion();
  const [prompt, setPrompt] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (!prompt.trim() || filled.length < 2) return;
    await add(prompt.trim(), filled, Math.min(answerIndex, filled.length - 1));
    setPrompt('');
    setOptions(['', '', '', '']);
    setAnswerIndex(0);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };

  return (
    <Card style={{ marginBottom: spacing.xl }}>
      <Text variant="body" style={{ marginBottom: spacing.sm }}>
        write a question about yourself
      </Text>
      <Text variant="caption" color={colors.muted} style={{ marginBottom: spacing.md }}>
        she answers it — and you answer hers. one score for both of you.
      </Text>
      <TextInput
        placeholder="my favorite…"
        placeholderTextColor={colors.muted}
        value={prompt}
        onChangeText={setPrompt}
        style={{
          color: colors.ink,
          borderBottomWidth: 1,
          borderColor: colors.line,
          paddingVertical: spacing.sm,
          marginBottom: spacing.md,
          fontSize: 15,
        }}
      />
      {options.map((opt, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs }}>
          <Pressable onPress={() => setAnswerIndex(i)} style={{ marginRight: spacing.sm }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 2,
                borderColor: answerIndex === i ? colors.rose : colors.line,
                backgroundColor: answerIndex === i ? colors.rose : 'transparent',
              }}
            />
          </Pressable>
          <TextInput
            placeholder={`option ${i + 1}${i === answerIndex ? ' (the truth)' : ''}`}
            placeholderTextColor={colors.muted}
            value={opt}
            onChangeText={(t) => setOptions((prev) => prev.map((o, j) => (j === i ? t : o)))}
            style={{
              flex: 1,
              color: colors.ink,
              borderBottomWidth: 1,
              borderColor: colors.line,
              paddingVertical: spacing.xs,
              fontSize: 15,
            }}
          />
        </View>
      ))}
      <View style={{ marginTop: spacing.sm }}>
        <Button label={done ? 'added ♥' : 'add it to the pile'} tone="ghost" onPress={() => void submit()} />
      </View>
    </Card>
  );
}

export function QuizScreen({ sessionId }: { sessionId: string }) {
  const game = useQuiz(sessionId);
  const partnerName = useSession((s) => s.partner?.nickname || s.partner?.display_name || 'her');
  const userId = useSession((s) => s.userId);

  if (game.loading || !game.state) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
        <Skeleton height={200} />
      </View>
    );
  }

  const s = game.state;

  if (game.outcome) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl }}>
        <Text variant="display" color={colors.rose} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
          {s.score} / {s.questions.length}
        </Text>
        <Text variant="title" style={{ textAlign: 'center' }}>
          {game.outcome.summary}
        </Text>
      </View>
    );
  }

  if (s.phase === 'lobby') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.xl }}>
        <Text variant="title" style={{ marginBottom: spacing.lg }}>
          how well do you know me
        </Text>
        <AddQuestionCard />
        <Button
          label="deal a round of six"
          haptic="medium"
          disabled={(game.questionBank.data?.length ?? 0) === 0}
          onPress={() => void game.begin(6)}
        />
        {(game.questionBank.data?.length ?? 0) === 0 ? (
          <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginTop: spacing.md }}>
            add at least one question first — the pile grows over time
          </Text>
        ) : null}
      </ScrollView>
    );
  }

  const q = game.question;
  if (!q) return null;
  const myTurn = q.authorId !== userId;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.xl }}>
      <Text variant="caption" color={colors.muted} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
        question {s.answers.length + 1} of {s.questions.length} · our score {s.score}
      </Text>
      <Card style={{ marginVertical: spacing.xl }}>
        <Text variant="caption" color={colors.gold} style={{ marginBottom: spacing.xs }}>
          about {q.authorId === userId ? 'you' : partnerName}
        </Text>
        <Text variant="title">{q.prompt}</Text>
      </Card>
      {myTurn ? (
        q.options.map((opt, i) => (
          <Pressable key={i} onPress={() => void game.answer(q.id, i)} style={{ marginBottom: spacing.sm }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: radius.md,
                padding: spacing.lg,
                backgroundColor: colors.surfaceAlt,
              }}
            >
              <Text variant="body">{opt}</Text>
            </View>
          </Pressable>
        ))
      ) : (
        <Text variant="body" color={colors.muted} style={{ textAlign: 'center' }}>
          {partnerName} is answering about you…
        </Text>
      )}
      {game.lastFailedMove ? (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="small" color={colors.rose} style={{ textAlign: 'center', marginBottom: spacing.sm }}>
            your answer did not reach her phone
          </Text>
          <Button label="answer again" tone="ghost" onPress={() => void game.retryFailed()} />
        </View>
      ) : null}
    </View>
  );
}
