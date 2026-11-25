"""The Dify flow: Python assembles the context, Dify processes, fetches (through Python tools) and streams,
Python grades and reflects.

    UI -> Java -> Python  context.build()          rules, concepts, intent + confidence; the prompts Dify needs
                -> Dify   Chatflow "HK ELI Chat"   model only when the rules are unsure; tool `answer` fetches
                                                   from Tableau as the user; model words the answer; streams it
                -> Python grade.grade()             every figure against the evidence, banned phrases;
                                                   one rewrite through Dify, then the template

Code still picks the view, the filters and every figure (pipeline.answer runs inside the `answer` tool).
Dify only sees prompts, the model's JSON and the worded answer: never rows, client ids or Tableau tokens.
"""
