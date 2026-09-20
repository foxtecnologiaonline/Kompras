import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
// `Swipeable` (non-Reanimated) is marked deprecated upstream in favor of
// ReanimatedSwipeable, but it needs no Babel plugin/worklets setup — the
// safer choice here since this project has no babel.config.js yet.
import { Swipeable, type SwipeableProps } from 'react-native-gesture-handler';

export interface SwipeAction {
  label: string;
  color: string;
  textColor?: string;
  accessibilityLabel: string;
  onPress: () => void;
}

interface Props {
  children: ReactNode;
  actions: SwipeAction[];
  enabled?: boolean;
}

const ACTION_WIDTH = 88;

export default function SwipeableRow({ children, actions, enabled = true }: Props) {
  const ref = useRef<Swipeable>(null);

  const renderRightActions: NonNullable<SwipeableProps['renderRightActions']> = (
    _progress,
    dragX
  ) => (
    <>
      {actions.map((action) => {
        const scale = dragX.interpolate({
          inputRange: [-ACTION_WIDTH * actions.length, 0],
          outputRange: [1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
            style={[styles.action, { backgroundColor: action.color, width: ACTION_WIDTH }]}
            onPress={() => {
              ref.current?.close();
              action.onPress();
            }}
          >
            <Animated.Text
              style={[styles.actionText, { color: action.textColor ?? '#fff', transform: [{ scale }] }]}
            >
              {action.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </>
  );

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={ref}
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={ACTION_WIDTH / 2}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  action: { justifyContent: 'center', alignItems: 'center' },
  actionText: { fontWeight: '700', fontSize: 14 },
});
