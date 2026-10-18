/**
 * quiz.js — рендер одного блока квиза.
 */
import { markQuiz, isQuizDone } from './progress.js';

export function createQuiz(data, lessonId, quizId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'quiz-block';
  if (isQuizDone(quizId)) wrapper.classList.add('quiz-passed');

  const question = document.createElement('h4');
  question.className = 'quiz-question';
  question.textContent = data.question;
  wrapper.appendChild(question);

  const list = document.createElement('ul');
  list.className = 'quiz-options';
  let selectedIndex = null;

  data.options.forEach((opt, idx) => {
    const li = document.createElement('li');
    li.className = 'quiz-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = quizId;
    input.id = `${quizId}-opt-${idx}`;
    input.value = idx;

    const label = document.createElement('label');
    label.htmlFor = input.id;
    label.textContent = opt;

    li.appendChild(input);
    li.appendChild(label);
    list.appendChild(li);

    input.addEventListener('change', () => {
      selectedIndex = idx;
      // сбросить предыдущие стили
      Array.from(list.children).forEach(child => child.classList.remove('correct', 'wrong'));
      if (idx === data.answer) {
        li.classList.add('correct');
        wrapper.classList.add('quiz-passed');
        markQuiz(lessonId, quizId);
        showExplanation();
      } else {
        li.classList.add('wrong');
      }
    });
  });

  wrapper.appendChild(list);

  const explanation = document.createElement('div');
  explanation.className = 'quiz-explanation';
  explanation.textContent = data.explanation || '';
  explanation.hidden = true;
  wrapper.appendChild(explanation);

  function showExplanation() {
    explanation.hidden = false;
  }

  if (isQuizDone(quizId)) {
    const correctLi = list.children[data.answer];
    if (correctLi) correctLi.classList.add('correct');
    showExplanation();
  }

  return wrapper;
}
