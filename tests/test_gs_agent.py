import asyncio
from gscientist.agents.camel_agent import GSAgent
from gscientist.tools.builtins.paper_search.arxiv import ArxivSearcher
import os
import yaml

from camel.messages import BaseMessage


async def main():
    # Load YAML configuration file
    with open(os.path.join("config", "config.yml"), "r") as f:
        config = yaml.safe_load(f)

    # Initialize the ArxivSearcher tool
    arxiv_searcher = ArxivSearcher()
    arxiv_tools = arxiv_searcher.get_tools()

    # Initialize the GSAgent
    agent = GSAgent('GSAgent', config, tools=arxiv_tools)

    # Create user message
    user_msg = BaseMessage.make_user_message(
        role_name="User",
        content="帮我搜索17篇object tracking的论文, 谢谢, 需要以markdown格式输出."
    )

    # Get response asynchronously
    response = await agent.astep(user_msg)
    print(response.msgs[0].content)


if __name__ == "__main__":
    asyncio.run(main())