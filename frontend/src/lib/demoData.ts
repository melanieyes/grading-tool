export const sampleQuestionText = `Q1. A web browser opens multiple tabs while sharing the same application process. Explain why modern operating systems often use multiple threads instead of creating a separate process for every tab. Discuss memory sharing, responsiveness, and failure isolation.

Q2. Compare preemptive scheduling and non-preemptive scheduling. If an operating system is designed for interactive users, which approach is usually more suitable and why?

Q3. A CPU scheduler must choose between First Come First Serve, Shortest Job First, and Round Robin. For a university computer lab with many short student tasks, which scheduling algorithm would you recommend? Justify your answer using fairness, waiting time, and responsiveness.`

export const sampleQuestionJson = `{
  "questions": [
    {
      "id": "q1",
      "text": "A web browser opens multiple tabs while sharing the same application process. Explain why modern operating systems often use multiple threads instead of creating a separate process for every tab. Discuss memory sharing, responsiveness, and failure isolation."
    },
    {
      "id": "q2",
      "text": "Compare preemptive scheduling and non-preemptive scheduling. If an operating system is designed for interactive users, which approach is usually more suitable and why?"
    },
    {
      "id": "q3",
      "text": "A CPU scheduler must choose between First Come First Serve, Shortest Job First, and Round Robin. For a university computer lab with many short student tasks, which scheduling algorithm would you recommend? Justify your answer using fairness, waiting time, and responsiveness."
    }
  ]
}`

export const sampleRubric = `Rubric Draft
Scale: 0–10 per question

Q1. Threading in operating systems
- Correct distinction between thread and process (0–4)
- Discussion of shared memory and efficiency (0–3)
- Discussion of responsiveness or failure tradeoffs (0–3)

Q2. Scheduling comparison
- Defines preemptive and non-preemptive scheduling correctly (0–4)
- Explains interactive-system implications (0–3)
- Uses reasoning and tradeoffs clearly (0–3)

Q3. Scheduling recommendation
- Chooses an appropriate algorithm (0–4)
- Justifies choice using fairness, waiting time, and responsiveness (0–4)
- Notes limitations or assumptions (0–2)`

export const sampleSubmissionJson = `{
  "submissions": [
    {
      "studentId": "student001",
      "answers": [
        {
          "questionId": "q1",
          "answer": "Threads share the same address space, so communication is cheaper than with separate processes. They also improve responsiveness because one thread can keep the UI active while another performs background tasks. However, threads are less isolated, so failures may spread more easily inside the same process."
        },
        {
          "questionId": "q2",
          "answer": "Preemptive scheduling allows the operating system to interrupt a running process, while non-preemptive scheduling waits until the process finishes or blocks. For interactive systems, preemptive scheduling is usually better because it improves response time and prevents one job from monopolizing the CPU."
        },
        {
          "questionId": "q3",
          "answer": "I would recommend Round Robin because it is fair and gives many short student tasks a chance to run quickly. It improves responsiveness compared with FCFS, and unlike SJF it does not require knowing burst times in advance."
        }
      ]
    },
    {
      "studentId": "student002",
      "answers": [
        {
          "questionId": "q1",
          "answer": "Threads are smaller than processes and faster."
        },
        {
          "questionId": "q2",
          "answer": "Preemptive means interrupting. Non-preemptive means not interrupting."
        },
        {
          "questionId": "q3",
          "answer": "FCFS is simple so I choose it."
        }
      ]
    }
  ]
}`